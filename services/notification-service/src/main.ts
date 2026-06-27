import 'dotenv/config';
import { Kafka, EachMessagePayload } from 'kafkajs';
import * as admin from 'firebase-admin';
import nodemailer from 'nodemailer';
import type { NotificationPayload, KafkaEvent } from '@mediflow/shared-types';

const kafka = new Kafka({
  clientId: 'notification-service',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
});

const consumer = kafka.consumer({ groupId: 'notification-service-group' });

// Firebase Admin for push notifications
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  });
}

// Email transporter (SendGrid SMTP)
const emailTransporter = nodemailer.createTransport({
  host: 'smtp.sendgrid.net',
  port: 587,
  auth: {
    user: 'apikey',
    pass: process.env.SENDGRID_API_KEY,
  },
});

const TOPIC_HANDLERS: Record<string, (payload: unknown) => NotificationPayload | null> = {
  'commerce.order.confirmed': (payload: any) => ({
    type: 'order_confirmed',
    recipientId: payload.patientId,
    title: 'Order Confirmed',
    titleAr: 'تم تأكيد الطلب',
    body: `Your order #${payload.orderId.slice(0, 8)} has been confirmed.`,
    bodyAr: `تم تأكيد طلبك رقم #${payload.orderId.slice(0, 8)}`,
    data: { orderId: payload.orderId },
    channels: ['push', 'in_app'],
  }),
  'logistics.delivery.completed': (payload: any) => ({
    type: 'order_delivered',
    recipientId: payload.patientId,
    title: 'Order Delivered!',
    titleAr: 'تم تسليم الطلب!',
    body: 'Your medication has been delivered successfully.',
    bodyAr: 'تم تسليم دوائك بنجاح.',
    data: { orderId: payload.orderId },
    channels: ['push', 'sms', 'in_app'],
  }),
  'clinical.prescription.issued': (payload: any) => ({
    type: 'prescription_issued',
    recipientId: payload.patientId,
    title: 'New Prescription',
    titleAr: 'وصفة طبية جديدة',
    body: 'Your doctor has issued a new prescription.',
    bodyAr: 'أصدر طبيبك وصفة طبية جديدة.',
    data: { prescriptionId: payload.prescriptionId },
    channels: ['push', 'in_app'],
  }),
};

async function sendPushNotification(token: string, title: string, body: string, data?: Record<string, string>) {
  try {
    await admin.messaging().send({
      token,
      notification: { title, body },
      data: data ?? {},
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default' } } },
    });
  } catch (err) {
    console.error('Push notification failed:', err);
  }
}

async function sendSms(phone: string, message: string) {
  // Twilio integration
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) return;

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        From: process.env.TWILIO_FROM_NUMBER || '',
        To: phone,
        Body: message,
      }),
    },
  );
  if (!response.ok) console.error('SMS failed:', await response.text());
}

async function sendEmail(to: string, subject: string, html: string) {
  await emailTransporter.sendMail({
    from: `MediFlow <${process.env.FROM_EMAIL || 'noreply@mediflow.io'}>`,
    to,
    subject,
    html,
  });
}

async function processNotification(notification: NotificationPayload) {
  console.log(JSON.stringify({
    level: 'INFO',
    action: 'notification.sending',
    type: notification.type,
    recipientId: notification.recipientId,
    channels: notification.channels,
  }));

  // In production: look up device tokens and user contact from DB
  for (const channel of notification.channels) {
    switch (channel) {
      case 'push':
        // await sendPushNotification(userToken, notification.title, notification.body);
        console.log(`PUSH → ${notification.recipientId}: ${notification.title}`);
        break;
      case 'sms':
        // await sendSms(userPhone, notification.body);
        console.log(`SMS → ${notification.recipientId}: ${notification.body}`);
        break;
      case 'email':
        // await sendEmail(userEmail, notification.title, `<p>${notification.body}</p>`);
        console.log(`EMAIL → ${notification.recipientId}: ${notification.title}`);
        break;
      case 'in_app':
        // Store in Redis pub/sub or DB for WebSocket delivery
        console.log(`IN_APP → ${notification.recipientId}`);
        break;
    }
  }
}

async function bootstrap() {
  await consumer.connect();

  const topics = Object.keys(TOPIC_HANDLERS);
  await consumer.subscribe({ topics, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, message }: EachMessagePayload) => {
      try {
        if (!message.value) return;
        const event = JSON.parse(message.value.toString()) as KafkaEvent;
        const handler = TOPIC_HANDLERS[topic];
        if (!handler) return;
        const notification = handler(event.payload);
        if (!notification) return;
        await processNotification(notification);
      } catch (err) {
        console.error({ err, topic }, 'Failed to process notification event');
      }
    },
  });

  console.log('Notification service running, consuming topics:', topics);

  process.on('SIGTERM', async () => {
    await consumer.disconnect();
    process.exit(0);
  });
}

bootstrap().catch(console.error);
