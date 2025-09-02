// Carrega variáveis de ambiente primeiro!
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios'); // Usaremos axios, que já está no seu projeto

// === SUPABASE CLIENT ===
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Captura erros globais para debug
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
console.log('[DEBUG] MAIL_USER:', process.env.MAIL_USER);
console.log('[DEBUG] MAIL_PASS:', process.env.MAIL_PASS ? '****' : 'NÃO DEFINIDA');


// =================================================================
// ROTA DE PAGAMENTO CORRIGIDA (USANDO AXIOS DA FORMA CERTA)
// =================================================================
app.post('/pagamento', async (req, res) => {
  try {
    const { amount, email, user_id } = req.body;
    if (!amount || !email || !user_id) {
      return res.status(400).json({ error: 'amount, email e user_id são obrigatórios' });
    }

    const valorCentavos = Math.round(Number(amount) * 100);

    const pagseguroPayload = {
      reference_id: user_id,
      description: 'Depósito via Pix',
      amount: {
        value: valorCentavos,
        currency: 'BRL'
      },
      payment_method: {
        type: 'PIX'
      },
      payer: {
        email: email
      }
    };

    // A URL da API está correta, o problema era o cabeçalho de autorização
    const response = await axios.post('https://api.pagseguro.com/pix/payments', pagseguroPayload, {
      headers: {
        // CORREÇÃO DEFINITIVA: Enviar o token diretamente, sem o prefixo "Bearer "
        'Authorization': process.env.PAGSEGURO_TOKEN,
        'Content-Type': 'application/json'
      }
    } );

    const result = response.data;

    if (result && result.qr_codes && result.qr_codes.length > 0 && result.qr_codes[0].base64) {
      res.json({
        id: result.id,
        status: result.status,
        qr_code: result.qr_codes[0].base64,
        qr_code_text: result.qr_codes[0].text
      });
    } else {
      console.error('[ERROR] Resposta inesperada do PagSeguro:', JSON.stringify(result, null, 2));
      res.status(500).json({ error: 'Erro ao gerar pagamento Pix', details: 'Resposta inesperada do PagSeguro' });
    }
  } catch (error) {
    if (error.response && error.response.data) {
      console.error('[ERROR] PagSeguro:', error.response.data);
      res.status(500).json({ error: 'Erro na API do PagSeguro', details: error.response.data });
    } else {
      console.error('[ERROR] PagSeguro Genérico:', error);
      res.status(500).json({ error: 'Erro ao gerar pagamento Pix pelo PagSeguro', details: error.message });
    }
  }
});


// === [WEBHOOK PAGSEGURO] ===
app.post('/webhook-pagseguro', async (req, res) => {
  try {
    let body = req.body;
    if (body && body.status && (body.status === 'PAID' || body.status === 'SUCCEEDED')) {
      const userId = body.reference_id;
      const valor = body.amount.value / 100;
      if (!userId) {
        console.error('[WEBHOOK] Sem reference_id, impossível creditar saldo.');
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
    if (!user_id) {
      return res.status(400).json({ error: 'user_id obrigatório' });
    }
    const { data: profile, error } = await supabase.from('profiles').select('balance').eq('id', user_id).single();
    if (error || !profile) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }
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
  console.log('🟢 Recebido POST em /api/solicitar-saque!!!');
  const { valor, metodo, pixKeyType, pixKey, bankName, accountNumber, branchNumber, usuario, user_id } = req.body;
  if (!user_id || typeof valor !== 'number' || valor <= 0) {
    return res.status(400).json({ error: 'Dados inválidos para saque.' });
  }
  try {
    const { data: profile, error: profileError } = await supabase.from('profiles').select('balance').eq('id', user_id).single();
    if (profileError || !profile) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }
    const saldoAtual = parseFloat(profile.balance);
    if (saldoAtual < valor) {
      return res.status(400).json({ error: 'Saldo insuficiente para saque.' });
    }
    const novoSaldo = saldoAtual - valor;
    const { error: updateError } = await supabase.from('profiles').update({ balance: novoSaldo }).eq('id', user_id);
    if (updateError) {
      return res.status(500).json({ error: 'Erro ao atualizar saldo.' });
    }
    await supabase.from('transactions').insert([{ user_id: user_id, type: 'withdrawal', amount: valor, payment_method: metodo, status: 'pending' }]);
    let saqueInfo = `<b>Solicitação de saque recebida:</b>  
<b>Usuário:</b> ${usuario || 'Desconhecido'}  
<b>Valor:</b> R$ ${Number(valor).toFixed(2)}  
<b>Método:</b> ${metodo}  
`;
    if (metodo === 'pix') {
      saqueInfo += `<b>Tipo de chave PIX:</b> ${pixKeyType || ''}  
<b>Chave PIX:</b> ${pixKey || ''}  
`;
    }
    if (metodo === 'bank-transfer') {
      saqueInfo += `<b>Banco:</b> ${bankName || ''}  
<b>Conta:</b> ${accountNumber || ''}  
<b>Agência:</b> ${branchNumber || ''}  
`;
    }
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
