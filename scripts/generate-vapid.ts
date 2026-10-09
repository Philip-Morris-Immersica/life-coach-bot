import webpush from "web-push";

// Генерира VAPID ключове за Web Push. Копирай ги в .env / Vercel env.
const keys = webpush.generateVAPIDKeys();
console.log("VAPID_PUBLIC_KEY=" + keys.publicKey);
console.log("VAPID_PRIVATE_KEY=" + keys.privateKey);
