const {authorized,validate}=require('../lib/alert');
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({message:'Method not allowed'});}
  if(!authorized(req,process.env.ALERT_API_TOKEN))return res.status(401).json({message:'Alert authorization required'});
  if(!validate(req.body))return res.status(400).json({message:'Invalid alert payload'});
  const allowed=(process.env.ALERT_ALLOWED_RECIPIENTS||'').split(',').map(x=>x.trim().toLowerCase());
  if(!allowed.includes(req.body.toEmail.toLowerCase()))return res.status(403).json({message:'Recipient is not approved'});
  if(!process.env.SENDGRID_API_KEY||!process.env.SENDGRID_FROM_EMAIL)return res.status(503).json({message:'Email service not configured'});
  try{

    const b=req.body;
    const response=await fetch('https://api.sendgrid.com/v3/mail/send',{method:'POST',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+process.env.SENDGRID_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({personalizations:[{to:[{email:b.toEmail}]}],from:{email:process.env.SENDGRID_FROM_EMAIL},subject:'[IoT Alert] '+b.metric+' '+b.condition,content:[{type:'text/plain',value:[b.device,b.metric+': '+b.value,'Threshold: '+b.threshold,b.condition,'Reported at: '+new Date().toISOString()].join('\n')}]})});
    if(!response.ok)throw new Error('Provider rejected request');
    return res.status(200).json({message:'Alert sent'});
  }catch{return res.status(502).json({message:'Email provider unavailable'});}
};
