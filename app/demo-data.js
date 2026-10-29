/* WhatsApp Blaster demo data. Synthetic: every person, number, message and figure is invented.
   Used when the console runs in demo mode (no database, no WhatsApp, no network). */
(function () {
  const now = Date.now();
  const H = 3600 * 1000, D = 24 * H;
  const at = (msAgo) => new Date(now - msAgo).toISOString();
  const day = (d, h = 10, m = 0) => { const x = new Date(now + d * D); x.setHours(h, m, 0, 0); return x.toISOString(); };

  const tags = ['customer', 'lead', 'vip', 'newsletter', 'event-2026', 'renewal-due'];
  const firstNames = ['Aarav', 'Diya', 'Kabir', 'Ananya', 'Rohan', 'Ishita', 'Vivaan', 'Meera', 'Arjun', 'Saanvi', 'Reyansh', 'Priya', 'Aditya', 'Nisha', 'Karan', 'Pooja', 'Dev', 'Riya', 'Yash', 'Tara', 'Sameer', 'Kavya', 'Nikhil', 'Sneha'];
  const lastNames = ['Mehta', 'Sharma', 'Patel', 'Iyer', 'Desai', 'Rao', 'Joshi', 'Nair', 'Kapoor', 'Reddy', 'Singh', 'Verma', 'Shah', 'Gupta', 'Menon', 'Bose'];
  const cities = ['Mumbai', 'Pune', 'Ahmedabad', 'Bengaluru', 'Hyderabad', 'Delhi', 'Surat', 'Jaipur'];
  const contacts = [];
  for (let i = 0; i < 48; i++) {
    const fn = firstNames[i % firstNames.length], ln = lastNames[(i * 7) % lastNames.length];
    contacts.push({
      id: 'c' + (i + 1), name: fn + ' ' + ln, phone: '91 9' + String(10000000 + i * 3571).slice(-9), // 91 9xxxxxxxxx (fake)
      email: (fn + '.' + ln).toLowerCase() + '@example.com', city: cities[i % cities.length],
      optIn: i % 9 !== 4, tags: [tags[i % 3], ...(i % 5 === 0 ? ['vip'] : []), ...(i % 4 === 1 ? ['event-2026'] : []), ...(i % 6 === 2 ? ['renewal-due'] : [])],
      createdAt: at((60 - i) * D), lastMessageAt: i < 14 ? at(i * 5 * H) : null, note: i % 11 === 3 ? 'Prefers calls after 6 pm' : '',
    });
  }

  const templates = [
    { id: 't1', name: 'appointment_reminder', category: 'UTILITY', language: 'en', status: 'APPROVED', updatedAt: at(12 * D),
      header: '', body: 'Hi {{1}}, this is a reminder of your appointment on {{2}} at {{3}}. Reply YES to confirm or call us to reschedule.', footer: 'Reply STOP to opt out', examples: ['Aarav', '20 Oct', '11:30 am'] },
    { id: 't2', name: 'order_update', category: 'UTILITY', language: 'en', status: 'APPROVED', updatedAt: at(20 * D),
      header: 'Order {{1}}', body: 'Your order {{1}} has been {{2}}. Expected delivery: {{3}}. Track it anytime by replying TRACK.', footer: '', examples: ['#4821', 'shipped', '22 Oct'] },
    { id: 't3', name: 'festive_offer', category: 'MARKETING', language: 'en', status: 'APPROVED', updatedAt: at(5 * D),
      header: '', body: 'Hi {{1}}! Our festive offer is live: {{2}} off on all services until {{3}}. Show this message at the counter.', footer: 'Reply STOP to opt out', examples: ['Diya', '20%', '31 Oct'] },
    { id: 't4', name: 'payment_due_notice', category: 'UTILITY', language: 'en', status: 'APPROVED', updatedAt: at(30 * D),
      header: '', body: 'Hello {{1}}, your invoice {{2}} of {{3}} is due on {{4}}. Pay online or at our office. Reply PAID once done.', footer: '', examples: ['Kabir', 'INV-1042', 'Rs 4,500', '25 Oct'] },
    { id: 't5', name: 'event_invitation', category: 'MARKETING', language: 'en', status: 'PENDING', updatedAt: at(1 * D),
      header: 'You are invited', body: 'Hi {{1}}, join us for {{2}} on {{3}} at {{4}}. Seats are limited. Reply YES to reserve yours.', footer: 'Reply STOP to opt out', examples: ['Meera', 'the Autumn Open House', '26 Oct', 'our main office'] },
    { id: 't6', name: 'welcome_new_customer', category: 'UTILITY', language: 'en', status: 'APPROVED', updatedAt: at(45 * D),
      header: '', body: 'Welcome aboard, {{1}}! Save this number to reach us any time. Our hours: {{2}}.', footer: '', examples: ['Ananya', 'Mon to Sat, 9 am to 7 pm'] },
    { id: 't7', name: 'feedback_request', category: 'MARKETING', language: 'en', status: 'REJECTED', updatedAt: at(3 * D), rejectedReason: 'INVALID_FORMAT: the body contains a variable at the very end. Variables cannot start or end the message text.',
      header: '', body: 'Thanks for visiting us, {{1}}. How did we do? Rate us 1 to 5 by replying with a number {{2}}', footer: '', examples: ['Rohan', 'today'] },
    { id: 't8', name: 'renewal_reminder_hi', category: 'UTILITY', language: 'hi', status: 'APPROVED', updatedAt: at(9 * D),
      header: '', body: 'नमस्ते {{1}}, आपकी सदस्यता {{2}} को समाप्त हो रही है। नवीनीकरण के लिए RENEW लिखकर भेजें।', footer: '', examples: ['Priya', '31 अक्टूबर'] },
    { id: 't9', name: 'otp_login', category: 'AUTHENTICATION', language: 'en', status: 'APPROVED', updatedAt: at(60 * D),
      header: '', body: '{{1}} is your verification code. For your security, do not share this code.', footer: 'This code expires in 10 minutes', examples: ['482913'] },
    { id: 't10', name: 'holiday_closure', category: 'UTILITY', language: 'en', status: 'DRAFT', updatedAt: at(2 * H),
      header: '', body: 'Dear {{1}}, we will be closed on {{2}} for {{3}}. We reopen on {{4}}. Thank you for your understanding.', footer: '', examples: ['Vivaan', '1 Nov', 'Diwali', '3 Nov'] },
  ];

  // campaigns with per-recipient results
  const mkRecipients = (ids, sent, delivered, read, replied, failReasons) => ids.map((id, i) => {
    const r = { contactId: id, status: 'sent', at: at(2 * D - i * 60000) };
    if (i < failReasons.length) { r.status = 'failed'; r.error = failReasons[i]; return r; }
    const k = i - failReasons.length;
    if (k < read) r.status = 'read'; else if (k < delivered) r.status = 'delivered';
    if (k < replied) r.replied = true;
    return r;
  });
  const idsFrom = (n, from = 0) => contacts.slice(from, from + n).map((c) => c.id);
  const campaigns = [
    { id: 'b1', name: 'October payment reminders', templateId: 't4', audience: { kind: 'tag', tag: 'renewal-due', label: 'Tag: renewal-due' }, status: 'sent', sentAt: at(2 * D), createdBy: 'Priya Menon',
      recipients: mkRecipients(idsFrom(38), 38, 30, 21, 6, ['Number is not on WhatsApp (131026)', 'Marketing message limit for this person (131049)']) },
    { id: 'b2', name: 'Festive offer: 20% off', templateId: 't3', audience: { kind: 'all', label: 'All opted-in contacts' }, status: 'sent', sentAt: at(6 * D), createdBy: 'Priya Menon',
      recipients: mkRecipients(idsFrom(43), 43, 34, 22, 9, ['Marketing message limit for this person (131049)', 'Marketing message limit for this person (131049)', 'Marketing message limit for this person (131049)', 'Number is not on WhatsApp (131026)', 'Person stopped marketing messages (131050)']) },
    { id: 'b3', name: 'Autumn Open House invitations', templateId: 't5', audience: { kind: 'tag', tag: 'event-2026', label: 'Tag: event-2026' }, status: 'scheduled', scheduledAt: day(3, 10, 0), createdBy: 'Dev Kapoor', recipients: idsFrom(12, 1).map((id) => ({ contactId: id, status: 'queued' })) },
    { id: 'b4', name: 'Welcome messages, new sign-ups', templateId: 't6', audience: { kind: 'sheet', label: 'Sheet: signups-october.xlsx (9 rows)' }, status: 'sent', sentAt: at(13 * D), createdBy: 'Dev Kapoor',
      recipients: mkRecipients(idsFrom(9, 30), 9, 9, 7, 3, []) },
    { id: 'b5', name: 'Diwali closure notice', templateId: 't10', audience: { kind: 'all', label: 'All opted-in contacts' }, status: 'draft', createdBy: 'Priya Menon', recipients: [] },
    { id: 'b6', name: 'Appointment reminders, this week', templateId: 't1', audience: { kind: 'tag', tag: 'customer', label: 'Tag: customer' }, status: 'sending', sentAt: at(20 * 60000), createdBy: 'Priya Menon',
      recipients: [...mkRecipients(idsFrom(16, 2), 16, 12, 5, 1, []), ...idsFrom(8, 18).map((id) => ({ contactId: id, status: 'queued' }))] },
  ];

  const convo = (contactId, msgs, extra = {}) => ({ contactId, status: 'open', assignee: null, unread: 0, botPaused: false, ...extra,
    messages: msgs.map(([dir, body, minsAgo, o]) => ({ id: 'm' + Math.random().toString(36).slice(2, 8), dir, body, at: at(minsAgo * 60000), status: dir === 'out' ? 'read' : undefined, ...(o || {}) })) });
  const conversations = [
    convo('c2', [['out', 'Hi Diya! Our festive offer is live: 20% off on all services until 31 Oct. Show this message at the counter.', 8700, { template: 'festive_offer', sender: 'campaign' }], ['in', 'Hi, is the offer valid on weekend bookings too?', 25], ['out', 'Yes, it applies on weekends as well. Would you like me to reserve a slot for you?', 23, { sender: 'staff', staff: 'Priya Menon' }], ['in', 'Saturday 11 am please', 4]], { unread: 1, assignee: 'Priya Menon' }),
    convo('c7', [['in', 'Hello! I got a payment reminder but I already paid yesterday', 140], ['out', 'Thanks for letting us know, Vivaan. I will check the payment and get back to you in a few minutes.', 131, { sender: 'staff', staff: 'Dev Kapoor' }], ['out', 'Confirmed: your payment of Rs 4,500 was received on 15 Oct. Sorry for the duplicate reminder.', 95, { sender: 'staff', staff: 'Dev Kapoor' }], ['in', 'No problem, thank you 🙏', 90]], { status: 'resolved', assignee: 'Dev Kapoor' }),
    convo('c11', [['in', 'What are your opening hours on Sunday?', 55], ['out', 'We are open Monday to Saturday, 9 am to 7 pm, and closed on Sundays. Anything else I can help with?', 54, { sender: 'staff', staff: 'Dev Kapoor' }], ['in', 'Can I book for Monday morning then', 50]], { unread: 1 }),
    convo('c3', [['out', 'Hello Kabir, your invoice INV-1042 of Rs 4,500 is due on 25 Oct. Pay online or at our office. Reply PAID once done.', 2880, { template: 'payment_due_notice', sender: 'campaign' }], ['in', 'PAID', 300], ['out', 'Thank you! We have noted your payment. A receipt will follow by email.', 299, { sender: 'staff', staff: 'Priya Menon' }]], { status: 'resolved' }),
    convo('c5', [['in', '[image] photo.jpg', 200, { media: 'image' }], ['in', 'This is the damaged item I mentioned', 199], ['out', 'Thank you for the photo, Rohan. A team member will look at it and reply here shortly.', 198, { sender: 'staff', staff: 'Dev Kapoor' }]], { unread: 2, assignee: null }),
    convo('c9', [['in', 'Do you offer home delivery to Jaipur?', 1500], ['out', 'Yes, we deliver to Jaipur within 3 to 5 working days. Delivery is free above Rs 2,000.', 1498, { sender: 'staff', staff: 'Priya Menon' }], ['in', 'Great, I will order this week', 1490]], { status: 'resolved', assignee: 'Priya Menon' }),
    convo('c13', [['in', 'STOP', 4300], ['out', 'Noted. We have stopped promotional messages to this number. Write START any time to hear from us again.', 4299, { sender: 'staff', staff: 'Priya Menon' }]], { status: 'resolved' }),
    convo('c1', [['out', 'Hi Aarav, this is a reminder of your appointment on 20 Oct at 11:30 am. Reply YES to confirm or call us to reschedule.', 30, { template: 'appointment_reminder', sender: 'campaign', status: 'delivered' }], ['in', 'YES', 12]], { unread: 1 }),
    convo('c20', [['in', 'Hi, I would like to know the price list', 2000], ['out', 'Hello Tara! I have sent our current price list below. Let me know if you have questions.', 1998, { sender: 'staff', staff: 'Dev Kapoor' }], ['out', '[document] price-list-2026.pdf', 1997, { sender: 'staff', staff: 'Dev Kapoor', media: 'document' }]], { status: 'resolved', assignee: 'Dev Kapoor' }),
    convo('c4', [['in', 'namaste, mera renewal kab hai?', 600], ['out', 'नमस्ते Ananya! आपकी सदस्यता 31 अक्टूबर को समाप्त हो रही है। नवीनीकरण के लिए RENEW लिखकर भेजें।', 599, { sender: 'staff', staff: 'Dev Kapoor' }]], { unread: 0 }),
    convo('c22', [['in', 'Is anyone there? I have been waiting for a reply since yesterday', 70]], { unread: 1, assignee: null }),
    convo('c8', [['out', 'Welcome aboard, Meera! Save this number to reach us any time. Our hours: Mon to Sat, 9 am to 7 pm.', 18700, { template: 'welcome_new_customer', sender: 'campaign' }], ['in', 'Thanks!', 18600]], { status: 'resolved' }),
  ];

  const events = [
    { id: 'e1', title: 'Autumn Open House', kind: 'event', startsAt: day(9, 11, 0), location: 'Main office, Pune', description: 'Open day for customers and prospects. Product demos, Q&A and refreshments.', capacity: 80, confirmed: 31, reminderTemplateId: 't5', remindDaysBefore: 2, audience: 'Tag: event-2026', status: 'planned' },
    { id: 'e2', title: 'Invoice due date, October', kind: 'reminder', startsAt: day(8, 9, 0), description: 'Send payment_due_notice to everyone with an unpaid October invoice.', reminderTemplateId: 't4', remindDaysBefore: 3, audience: 'Tag: renewal-due', status: 'planned' },
    { id: 'e3', title: 'Diwali closure', kind: 'reminder', startsAt: day(15, 9, 0), description: 'Tell every contact about the closure dates.', reminderTemplateId: 't10', remindDaysBefore: 5, audience: 'All opted-in contacts', status: 'needs template approval' },
    { id: 'e4', title: 'Customer feedback call, Q4', kind: 'event', startsAt: day(21, 16, 0), location: 'Online', description: 'Group call with VIP customers.', capacity: 25, confirmed: 8, reminderTemplateId: 't1', remindDaysBefore: 1, audience: 'Tag: vip', status: 'planned' },
    { id: 'e5', title: 'September webinar', kind: 'event', startsAt: day(-22, 17, 0), location: 'Online', description: 'Product update webinar.', capacity: 100, confirmed: 64, reminderTemplateId: 't5', remindDaysBefore: 1, audience: 'Tag: newsletter', status: 'done' },
  ];

  // 30 days of daily figures for the dashboard and reports
  const daily = [];
  for (let i = 29; i >= 0; i--) {
    const base = 40 + Math.round(30 * Math.abs(Math.sin(i / 3.1))) + (i % 7 === 0 ? 90 : 0);
    const delivered = Math.round(base * 0.9), read = Math.round(delivered * 0.72), replies = Math.round(read * 0.24), failed = base - delivered;
    daily.push({ date: new Date(now - i * D).toISOString().slice(0, 10), sent: base, delivered, read, replies, failed, inbound: replies + Math.round(6 + 5 * Math.abs(Math.cos(i / 2))) });
  }

  const team = [
    { id: 'u1', name: 'Priya Menon', email: 'priya@example.com', role: 'owner', lastActive: at(20 * 60000) },
    { id: 'u2', name: 'Dev Kapoor', email: 'dev@example.com', role: 'manager', lastActive: at(3 * H) },
    { id: 'u3', name: 'Nisha Verma', email: 'nisha@example.com', role: 'agent', lastActive: at(2 * D) },
  ];
  const activity = [
    ['Priya Menon', 'sent campaign', 'Appointment reminders, this week', 20], ['Dev Kapoor', 'replied in Inbox', 'Vivaan Joshi', 95], ['Priya Menon', 'submitted template', 'event_invitation', 24 * 60],
    ['Dev Kapoor', 'scheduled campaign', 'Autumn Open House invitations', 26 * 60], ['Nisha Verma', 'imported contacts', '9 rows from signups-october.xlsx', 2 * 24 * 60], ['Priya Menon', 'edited quick reply', 'Opening hours', 3 * 24 * 60],
    ['Priya Menon', 'sent campaign', 'October payment reminders', 2 * 24 * 60 + 15], ['Dev Kapoor', 'added team member', 'Nisha Verma (agent)', 5 * 24 * 60],
  ].map(([who, action, detail, minsAgo]) => ({ who, action, detail, at: at(minsAgo * 60000) }));

  const settings = {
    business: { name: 'Northwind Services', tagline: 'Friendly service, every day', about: 'A small services business that uses WhatsApp Blaster to keep in touch with its customers.', hours: 'Mon to Sat, 9 am to 7 pm', phone: '+91 98765 00000', email: 'hello@example.com', website: 'https://example.com', address: '12 Market Street, Pune 411001' },
    whatsapp: { connected: true, displayName: 'Northwind Services', phone: '+91 98765 00000', phoneNumberId: '1000000000000', wabaId: '2000000000000', quality: 'GREEN', tier: '1K per day', tokenSaved: true, appSecretSaved: true, verifyToken: 'northwind-verify', webhookUrl: 'https://your-server.example/webhook/wa-bot', lastEventAt: at(12 * 60000) },
    bot: { enabled: true, greeting: 'Hello! Welcome to Northwind Services. How can we help you today?', handoff: 'A team member will reply here shortly.', ackReply: 'Thank you! We are here if you need anything.', pauseMinutes: 30,
      menu: [{ id: 'm1', title: 'Our services', answer: 'We offer repairs, maintenance plans and home visits. Reply with what you need and we will guide you.' }, { id: 'm2', title: 'Opening hours', answer: 'We are open Monday to Saturday, 9 am to 7 pm, and closed on Sundays.' }, { id: 'm3', title: 'Location', answer: '12 Market Street, Pune 411001. Parking is available behind the building.' }, { id: 'm4', title: 'Talk to a person', answer: '' }],
      faq: [{ q: 'Do you deliver outside Pune?', a: 'Yes, we deliver across Maharashtra within 3 to 5 working days.' }, { q: 'How do I pay?', a: 'By UPI, card or bank transfer. We send a receipt by email.' }, { q: 'Can I reschedule an appointment?', a: 'Yes, reply RESCHEDULE with your preferred day and time.' }] },
    ai: { enabled: false, provider: 'gemini', keyStatus: 'not configured' },
  };

  window.DEMO = { contacts, templates, campaigns, conversations, events, daily, team, activity, settings, tags, generatedAt: at(0) };
})();
