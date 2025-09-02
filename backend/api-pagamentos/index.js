// Carrega variáveis de ambiente primeiro!
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios'); // Usaremos axios

// === SUPABASE CLIENT ===
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Captura erros globais
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
});

const app = express();

// Configuração do CORS
const allowedOrigins = [
  'https://numero-randomico.netlify.app',
  'http://127.0.0.1:5500'
];

app.use(cors({
  origin: function (origin, callback ) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true
}));

app.use(express.json());

// DEBUG vars de ambiente
console.log('[DEBUG] PAGSEGURO_TOKEN:', !!process.env.PAGSEGURO_TOKEN);

// =================================================================
// ROTA DE PAGAMENTO FINAL E CORRIGIDA (USANDO A API DE PEDIDOS)
// =================================================================
app.post('/pagamento', async (req, res) => {
  try {
    const { amount, email, user_id } = req.body;
    if (!amount || !email || !user_id) {
      return res.status(400).json({ error: 'amount, email e user_id são obrigatórios' });
    }

    const valorCentavos = Math.round(Number(amount) * 100);

    // Payload para a API de Pedidos (Orders API)
    const orderPayload = {
      reference_id: `user_${user_id}_${Date.now()}`, // Referência única para o pedido
      customer: {
        email: email
      },
      items: [
        {
          name: 'Depósito de Créditos',
          quantity: 1,
          unit_amount: valorCentavos
        }
      ],
      qr_codes: [
        {
          amount: {
            value: valorCentavos
          }
        }
      ],
      notification_urls: [
        `https://random-num2-cbo9.onrender.com/webhook-pagseguro` // URL do seu webhook
      ]
    };

    // Chamada para a API de Pedidos, que usa autenticação Bearer
    const response = await axios.post('https://api.pagseguro.com/orders', orderPayload, {
      headers: {
        'Authorization': `Bearer ${process.env.PAGSEGURO_TOKEN}`,
        'Content-Type': 'application/json'
      }
    } );

    const result = response.data;

    // A estrutura da resposta da API de Pedidos é um pouco diferente
    if (result && result.qr_codes && result.qr_codes.length > 0) {
      const qrCodeData = result.qr_codes[0];
      res.json({
        id: result.id,
        status: result.status,
        qr_code: qrCodeData.links.find(link => link.rel === 'QRCODE.PNG').href.split('base64,')[1], // Extrai o base64
        qr_code_text: qrCodeData.text
      });
    } else {
      console.error('[ERROR] Resposta inesperada do PagSeguro (Orders API):', JSON.stringify(result, null, 2));
      res.status(500).json({ error: 'Erro ao gerar pagamento Pix', details: 'Resposta inesperada do PagSeguro' });
    }
  } catch (error) {
    const errorDetails = error.response?.data || { message: error.message };
    console.error('[ERROR] PagSeguro (Orders API):', JSON.stringify(errorDetails, null, 2));
    res.status(500).json({ error: 'Erro na API do PagSeguro', details: errorDetails });
  }
});


// === [WEBHOOK PAGSEGURO] ===
// A estrutura do webhook da API de Pedidos pode ser diferente.
// Verifique a documentação ou os logs para ajustar se necessário.
app.post('/webhook-pagseguro', async (req, res) => {
  try {
    const body = req.body;
    console.log('[WEBHOOK] Notificação recebida:', JSON.stringify(body, null, 2));

    // A API de Pedidos envia o status dentro de 'charges'
    const charge = body.charges && body.charges[0];
    if (charge && charge.status === 'PAID') {
      // A referência do usuário pode estar no 'reference_id' principal
      const referenceId = body.reference_id; // ex: "user_uuid_timestamp"
      const userId = referenceId.split('_')[1]; // Extrai o UUID do usuário
      
      const valor = charge.amount.value / 100;

      if (!userId) {
        console.error('[WEBHOOK] Não foi possível extrair o user_id da referência:', referenceId);
      } else {
        const { data: profile, error: profileError } = await supabase.from('profiles').select('balance').eq('id', userId).single();
        if (profileError || !profile) {
          console.error('[WEBHOOK] Usuário não encontrado:', userId);
        } else {
          const novoSaldo = parseFloat(profile.balance) + valor;
          const { error: updateError } = await supabase.from('profiles').update({ balance: novoSaldo }).eq('id', userId);
          if (updateError) {
            console.error('[WEBHOOK] Erro ao atualizar saldo:', updateError);
          } else {
            await supabase.from('transactions').insert([{ user_id: userId, type: 'deposit', amount: valor, payment_method: 'pix', status: 'completed' }]);
            console.log(`[WEBHOOK] Saldo creditado para o usuário ${userId}: +R$${valor}`);
          }
        }
      }
    }
    res.sendStatus(200);
  } catch (error) {
    console.error('[WEBHOOK] PagSeguro erro:', error);
    res.sendStatus(500);
  }
});


// === [ROTA DE CONSULTA DE SALDO] ===
app.get('/api/saldo', async (req, res) => {
  try {
    const user_id = req.query.user_id;
    if (!user_id) { return res.status(400).json({ error: 'user_id obrigatório' }); }
    const { data: profile, error } = await supabase.from('profiles').select('balance').eq('id', user_id).single();
    if (error || !profile) { return res.status(404).json({ error: 'Usuário não encontrado.' }); }
    res.json({ balance: parseFloat(profile.balance) });
  } catch (error) {
    console.error('[SALDO] Erro ao buscar saldo:', error);
    res.status(500).json({ error: 'Erro ao buscar saldo.' });
  }
});

// === [CONFIGURAÇÃO NODEMAILER] ===
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
  }
});

// === [ROTA DE SAQUE] ===
app.post('/api/solicitar-saque', async (req, res) => {
  const { valor, metodo, pixKeyType, pixKey, bankName, accountNumber, branchNumber, usuario, user_id } = req.body;
  if (!user_id || typeof valor !== 'number' || valor <= 0) { return res.status(400).json({ error: 'Dados inválidos para saque.' }); }
  try {
    const { data: profile, error: profileError } = await supabase.from('profiles').select('balance').eq('id', user_id).single();
    if (profileError || !profile) { return res.status(404).json({ error: 'Usuário não encontrado.' }); }
    const saldoAtual = parseFloat(profile.balance);
    if (saldoAtual < valor) { return res.status(400).json({ error: 'Saldo insuficiente para saque.' }); }
    const novoSaldo = saldoAtual - valor;
    const { error: updateError } = await supabase.from('profiles').update({ balance: novoSaldo }).eq('id', user_id);
    if (updateError) { return res.status(500).json({ error: 'Erro ao atualizar saldo.' }); }
    await supabase.from('transactions').insert([{ user_id: user_id, type: 'withdrawal', amount: valor, payment_method: metodo, status: 'pending' }]);
    let saqueInfo = `<b>Solicitação de saque recebida:</b>  
<b>Usuário:</b> ${usuario || 'Desconhecido'}  
<b>Valor:</b> R$ ${Number(valor).toFixed(2)}  
<b>Método:</b> ${metodo}  
`;
    if (metodo === 'pix') { saqueInfo += `<b>Tipo de chave PIX:</b> ${pixKeyType || ''}  
<b>Chave PIX:</b> ${pixKey || ''}  
`; }
    if (metodo === 'bank-transfer') { saqueInfo += `<b>Banco:</b> ${bankName || ''}  
<b>Conta:</b> ${accountNumber || ''}  
<b>Agência:</b> ${branchNumber || ''}  
`; }
    await transporter.sendMail({ from: process.env.MAIL_USER, to: 'maiconsantoslnum@gmail.com', subject: 'Nova solicitação de saque', html: saqueInfo });
    res.status(200).json({ success: true, message: 'Solicitação de saque enviada e saldo descontado!' });
  } catch (err) {
    console.error('❌ Erro no saque:', err);
    res.status(500).json({ success: false, error: 'Erro ao processar o saque.' });
  }
});

// === [START SERVER] ===
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Backend correto rodando! API em http://localhost:${PORT}` );
});
