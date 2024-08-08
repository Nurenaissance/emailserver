import express from 'express';
import nodemailer from 'nodemailer';
import bodyParser from 'body-parser';
import cors from 'cors';
import Imap from 'imap';
import { simpleParser } from 'mailparser';
import imaps from 'imap-simple';
const { v4: uuidv4 } = require('uuid'); 


const app = express();
const port = 3001;

app.use(bodyParser.json());
app.use(cors());

app.post('/send-email', async (req, res) => {
  const { smtpUser, smtpPass, to, subject, text , host, port} = req.body;

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
  };

  try {
    let info = await transporter.sendMail(mailOptions);
    res.json({ message: 'Email sent', info });
  } catch (error) {
    res.status(500).json({ message: 'Error sending email', error });
  }
});

app.post('/receive-emails', async (req, res) => {
    const { imapUser, imapPass,host,port } = req.body;
  
    const config = {
      imap: {
        user: imapUser,
        password: imapPass,
        host: host,
        port: port,
        tls: true,
        authTimeout: 10000, // Increase to 10 seconds or more
        timeout: 30000, // Increase the overall timeout to 30 seconds or more
      },
    };
  
    try {
      const connection = await imaps.connect({ imap: config.imap });
      await connection.openBox('INBOX');
  
      const searchCriteria = [
        'UNSEEN',
       
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
  
          return {
            id: uuidv4(),
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

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
