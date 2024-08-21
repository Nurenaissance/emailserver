import express from 'express';
import nodemailer from 'nodemailer';
import bodyParser from 'body-parser';
import cors from 'cors';
import Imap from 'imap';
import { simpleParser } from 'mailparser';
import imaps from 'imap-simple';
import { v4 as uuidv4 } from 'uuid';


const app = express();
const port = 3001;

app.use(bodyParser.json());
app.use(cors());

app.post('/send-email', async (req, res) => {
  const { smtpUser, smtpPass, to, subject, text , host, html, port} = req.body;
  
  let transporter = nodemailer.createTransport({
    host: host, // Hostinger's SMTP server
    port: port, // Typically 465 for secure connections
    secure: true, // Use SSL
    auth: {
      user: smtpUser, // Your Hostinger email
      pass: smtpPass, // Your Hostinger email password
    },
  });

  let mailOptions = {
    from: smtpUser, // Sender address
    to: to, // List of receivers
    subject: subject, // Subject line
    text: text, // Plain text body
    html: html, // HTML body
    attachments: req.files ? req.files.map(file => ({
      filename: file.originalname,
      path: file.path
    })) : []
  };
  console.log('Transporter and mail options configured. Attempting to send email...');

 
  try {
    let info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info);
    res.json({ message: 'Email sent', info });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ message: 'Error sending email', error });
  }
});
function extractUniqueId(email) {
  // Use a regular expression to extract the text before "Content-Type"
  const contentTypePattern = /Content-Type/;
  
  // Get the index of "Content-Type"
  const contentTypeIndex = email.text.search(contentTypePattern);
  
  // If "Content-Type" is found, extract the unique part
  if (contentTypeIndex !== -1) {
      // Extract the unique identifier from the text
      const uniquePart = email.text.substring(0, contentTypeIndex).trim();
      // Optionally, you can hash the unique part to ensure it is unique
      return uniquePart; // You can return a hashed version for uniqueness if needed
  }

  // Fallback if "Content-Type" is not found
  return email.text; // Return the entire text as a fallback
}

app.post('/receive-emails', async (req, res) => {
    const { imapUser, imapPass,host,port } = req.body;
   
    const config = {
      imap: {
        user: imapUser,
        password: imapPass,
        host: host,
        port: port, 
        tls: true,
        tlsOptions: { rejectUnauthorized: false },
        authTimeout: 10000, // Increase to 10 seconds or more
        timeout: 30000, // Increase the overall timeout to 30 seconds or more
      },
    };
  
    try {
      const connection = await imaps.connect({ imap: config.imap });
      await connection.openBox('INBOX');
  
      const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    // Convert to the format that IMAP expects: "DD-MMM-YYYY"
    const formattedDate = oneWeekAgo.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).replace(/ /g, '-');

    const searchCriteria = [
      'UNSEEN',
      ['SINCE', formattedDate],  // Filter emails since one week ago
    ];
      const fetchOptions = {
        bodies: ['HEADER', 'TEXT'],
        struct: true,
        markSeen: false,
      };
  
      const messages = await connection.search(searchCriteria, fetchOptions);
      const emails = await Promise.all(
        messages.map(async (item) => {
          const header = item.parts.find((part) => part.which === 'HEADER');
          const body = item.parts.find((part) => part.which === 'TEXT');
  
          const parsedHeader = header && header.body
            ? {
                from: header.body.from ? header.body.from[0] : 'Unknown Sender',
                subject: header.body.subject ? header.body.subject[0] : 'No Subject',
              }
            : {
                from: 'Unknown Sender',
                subject: 'No Subject',
              };
  
          const parsedBody = body && body.body ? body.body : 'No Content';
          const uniqueId = extractUniqueId({ text: parsedBody });
          return {
            id: uniqueId,
            from: parsedHeader.from,
            subject: parsedHeader.subject,
            text: parsedBody,
          };
        })
      );
  
      connection.end();
      res.json(emails);
    } catch (error) {
      console.error('Error receiving emails:', error);
      res.status(500).json({ message: 'Error receiving emails', error });
    }
  });

  app.post('/send-mass-email', async (req, res) => {
    const { smtpUser, smtpPass, recipients, subject, text, html, host, port } = req.body;
  
    let transporter = nodemailer.createTransport({
      host: host, // SMTP server
      port: port, // Typically 465 for secure connections
      secure: true, // Use SSL
      auth: {
        user: smtpUser, // Your email
        pass: smtpPass, // Your email password
      },
    });
  
    const sendEmail = async (to) => {
      let mailOptions = {
        from: smtpUser,
        to: to,
        subject: subject,
        text: text,
        html: html,
      };
  
      try {
        let info = await transporter.sendMail(mailOptions);
        console.log(`Email sent to ${to}:`, info);
        return { to, status: 'success', info };
      } catch (error) {
        console.error(`Error sending email to ${to}:`, error);
        return { to, status: 'error', error };
      }
    };
  
    // Send emails in batches with a delay to avoid spamming
    const batchSize = 10; // Adjust as needed
    const delayBetweenBatches = 2000; // 2 seconds delay between batches
    let results = [];
  
    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(sendEmail));
      results = results.concat(batchResults);
  
      if (i + batchSize < recipients.length) {
        await new Promise((resolve) => setTimeout(resolve, delayBetweenBatches));
      }
    }
  
    res.json({ message: 'Mass email operation completed', results });
  });

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
