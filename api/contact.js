const sgMail = require('@sendgrid/mail');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { companyName, contactName, phone, email, message } = req.body;

  if (!companyName || !contactName || !phone || !email || !message) {
    return res.status(400).json({ error: 'すべての項目を入力してください' });
  }

  sgMail.setApiKey(process.env.SENDGRID_API_KEY);

  const msg = {
    to: process.env.TO_EMAIL,
    from: process.env.TO_EMAIL,
    subject: `【CV company AIチャット】${companyName} 様よりお問い合わせ`,
    text: `
CV company AIチャットボットよりお問い合わせが届きました。

■ 会社名：${companyName}
■ 担当者名：${contactName}
■ 電話番号：${phone}
■ メールアドレス：${email}
■ お問い合わせ内容：
${message}

---
このメールはCV company AIチャットボットより自動送信されています。
    `,
    html: `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #111e35; border-bottom: 2px solid #e8294a; padding-bottom: 10px;">
    CV company AIチャット お問い合わせ
  </h2>
  <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
    <tr style="background: #f5f7fa;">
      <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; width: 30%;">会社名</td>
      <td style="padding: 10px; border: 1px solid #ddd;">${companyName}</td>
    </tr>
    <tr>
      <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">担当者名</td>
      <td style="padding: 10px; border: 1px solid #ddd;">${contactName}</td>
    </tr>
    <tr style="background: #f5f7fa;">
      <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">電話番号</td>
      <td style="padding: 10px; border: 1px solid #ddd;">${phone}</td>
    </tr>
    <tr>
      <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">メールアドレス</td>
      <td style="padding: 10px; border: 1px solid #ddd;">${email}</td>
    </tr>
    <tr style="background: #f5f7fa;">
      <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">お問い合わせ内容</td>
      <td style="padding: 10px; border: 1px solid #ddd;">${message.replace(/\n/g, '<br>')}</td>
    </tr>
  </table>
  <p style="color: #999; font-size: 12px; margin-top: 20px;">
    このメールはCV company AIチャットボットより自動送信されています。
  </p>
</div>
    `,
  };

  try {
    await sgMail.send(msg);
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('SendGrid error:', error);
    return res.status(500).json({ error: 'メール送信に失敗しました' });
  }
}
