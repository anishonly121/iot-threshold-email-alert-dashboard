const crypto = require('node:crypto');
function authorized(req, token) {
  const received = req.headers.authorization || '';
  const expected = 'Bearer ' + token;
  return !!token && received.length === expected.length && crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}
function validate(body) {
  if(!body || !['Temperature','Humidity'].includes(body.metric)) return false;
  if(!['below minimum','above maximum'].includes(body.condition)) return false;
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.toEmail || '') || body.toEmail.length > 254) return false;
  if(!['value','threshold'].every(k=>body[k]!==null&&body[k]!==''&&Number.isFinite(Number(body[k]))))return false;
  if(typeof body.device !== 'string' || body.device.length>80)return false;
  return body.condition==='below minimum'?Number(body.value)<Number(body.threshold):Number(body.value)>Number(body.threshold);
}
module.exports={authorized,validate};
