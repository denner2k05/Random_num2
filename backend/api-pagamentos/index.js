// Carrega variáveis de ambiente primeiro!
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios'); // PagSeguro API

// === SUPABASE CLIENT ===
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Captura erros globais para debug de promessas não tratadas
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
});

const app = express();

// NOVO E CORRIGIDO
const allowedOrigins = [
  'https://numero-randomico.netlify.app', // Sua URL de produção
  'http://127.0.0.1:5500'                 // Sua URL de desenvolvimento local
];

app.use(cors({
  origin: function (origin, callback ) {
    // Permite requisições sem 'origin' (como apps mobile ou Postman) ou se a origem estiver na lista
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

// === [ROTA DE PAGAMENTO PIX DIRETO - PAGSEGURO] ===
app.post('/pagamento', async (req, res) => {
  try {
    const { amount, email, user_id } = req.body; // user_id agora é obrigatório!
    if (!amount || !email || !user_id) {
      return res.status(400).json({ error: 'amount, email e user_id são obrigatórios' });
    }

    // PagSeguro usa centavos!
    const valorCentavos = Math.round(Number(amount) * 100);

    // Dados para PagSeguro (conforme documentação oficial)
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

    const response = await axios.post('https://pix.api.pagseguro.com/pix/payments', pagseguroPayload, {
      headers: {
        'Authorization': `Bearer ${process.env.PAGSEGURO_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    // A resposta do PagSeguro contém o QR CODE em base64 e outros dados
    const result = response.data;

    if (
      result &&
      result.qr_codes &&
      result.qr_codes.length > 0 &&
      result.qr_codes[0].base64
    ) {
      res.json({
        id: result.id,
        status: result.status,
        qr_code: result.qr_codes[0].base64,
        qr_code_text: result.qr_codes[0].text
      });
    } else {
      // Se não veio o QR, loga tudo para debug
      console.error('[ERROR] Resposta inesperada do PagSeguro:', JSON.stringify(result, null, 2));
      res.status(500).json({ error: 'Erro ao gerar pagamento Pix', details: 'Resposta inesperada do PagSeguro', full: result });
    }
  } catch (error) {
    // Mostra erro detalhado do PagSeguro (se houver)
    if (error.response && error.response.data) {
      console.error('[ERROR] PagSeguro:', error.response.data);
    } else {
      console.error('[ERROR] PagSeguro:', error);
    }
    res.status(500).json({ error: 'Erro ao gerar pagamento Pix pelo PagSeguro', details: error.message || error });
  }
});

// === [WEBHOOK PAGSEGURO] ===
app.post('/webhook-pagseguro', async (req, res) => {
  try {
    // Estrutura do webhook do PagSeguro (consulte a documentação)
    let body = req.body;

    // Exemplo: { id, reference_id, status, amount: { value, currency }, ... }
    // Só credita se status for 'PAID' (ou 'SUCCEEDED')
    if (body && body.status && (body.status === 'PAID' || body.status === 'SUCCEEDED')) {
      const userId = body.reference_id;
      const valor = body.amount.value / 100; // centavos para reais

      if (!userId) {
        console.error('[WEBHOOK] Sem reference_id, impossível creditar saldo.');
      } else {
        // Atualiza saldo (credita)
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('balance')
          .eq('id', userId)
          .single();

        if (profileError || !profile) {
          console.error('[WEBHOOK] Usuário não encontrado:', userId);
        } else {
          const novoSaldo = parseFloat(profile.balance) + valor;
          const { error: updateError } = await supabase
            .from('profiles')
            .update({ balance: novoSaldo })
            .eq('id', userId);

          if (updateError) {
            console.error('[WEBHOOK] Erro ao atualizar saldo:', updateError);
          } else {
            // Registra a transação como "completed"
            await supabase
              .from('transactions')
              .insert([{
                user_id: userId,
                type: 'deposit',
                amount: valor,
                payment_method: 'pix',
                status: 'completed'
              }]);
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
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('balance')
      .eq('id', user_id)
      .single();

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
    // 1. Buscar saldo atual
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('balance')
      .eq('id', user_id)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const saldoAtual = parseFloat(profile.balance);
    if (saldoAtual < valor) {
      return res.status(400).json({ error: 'Saldo insuficiente para saque.' });
    }

    // 2. Descontar valor
    const novoSaldo = saldoAtual - valor;

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ balance: novoSaldo })
      .eq('id', user_id);

    if (updateError) {
      return res.status(500).json({ error: 'Erro ao atualizar saldo.' });
    }

    // 3. Registrar transação
    await supabase
      .from('transactions')
      .insert([{
        user_id: user_id,
        type: 'withdrawal',
        amount: valor,
        payment_method: metodo,
        status: 'pending'
      }]);

    // 4. Enviar e-mail
    let saqueInfo = `<b>Solicitação de saque recebida:</b><br>`;
    saqueInfo += `<b>Usuário:</b> ${usuario || 'Desconhecido'}<br>`;
    saqueInfo += `<b>Valor:</b> R$ ${Number(valor).toFixed(2)}<br>`;
    saqueInfo += `<b>Método:</b> ${metodo}<br>`;
    if (metodo === 'pix') {
      saqueInfo += `<b>Tipo de chave PIX:</b> ${pixKeyType || ''}<br>`;
      saqueInfo += `<b>Chave PIX:</b> ${pixKey || ''}<br>`;
    }
    if (metodo === 'bank-transfer') {
      saqueInfo += `<b>Banco:</b> ${bankName || ''}<br>`;
      saqueInfo += `<b>Conta:</b> ${accountNumber || ''}<br>`;
      saqueInfo += `<b>Agência:</b> ${branchNumber || ''}<br>`;
    }

    await transporter.sendMail({
      from: process.env.MAIL_USER,
      to: 'maiconsantoslnum@gmail.com',
      subject: 'Nova solicitação de saque',
      html: saqueInfo
    });

    res.status(200).json({ success: true, message: 'Solicitação de saque enviada e saldo descontado!' });

  } catch (err) {
    console.error('❌ Erro no saque:', err);
    res.status(500).json({ success: false, error: 'Erro ao processar o saque.' });
  }
});

// === [START SERVER - Porta dinâmica para Railway] ===
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Backend correto rodando!`);
  console.log(`API rodando em http://localhost:${PORT}`);
});