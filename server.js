import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'node:url';
const app = express();
const root = fileURLToPath(new URL('.', import.meta.url));
const url = process.env.SUPABASE_URL || 'https://hvomujwvovwmilotgolp.supabase.co';
const key = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_HPk1MkktUxhDvtRp8tS1OA_i-YCp2cD';
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.get('/api/config', (req, res) => res.json({ url, key }));
app.use('/api', async (req, res, next) => {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return res.status(401).json({ error: 'Sign in to continue.' });
  req.db = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await req.db.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ error: 'Your session expired. Sign in again.' });
  req.user = data.user;
  next();
});
const check = ({ data, error }) => { if (error) throw error; return data; };
app.get('/api/state', async (req, res, next) => {
  try {
    const db = req.db;
    const results = await Promise.all([
      db.from('User').select('*').eq('authUserID', req.user.id).maybeSingle(),
      db.from('Interest').select('*').order('interestID'),
      db.from('Events').select('*, Organization!orgID(orgName), "Event Interests"(Interest(name))').order('date'),
      db.from('User Interests').select('Interest(name)'),
      db.from('UserEvents').select('eventID').eq('isSaved', true),
      db.from('Organization Admins').select('orgID, Organization!orgID(orgName)')
    ]);
    const [profile, interests, events, chosen, saved, admins] = results.map(check);
    res.json({ profile: profile && { name: `${profile.firstName} ${profile.lastName}`, uni: profile.uniName, level: profile.studyLevel, graduation: profile.gradDate.slice(0,7), bio: profile.biography, photo: profile.photoURL, interest: profile.primaryInterest }, launch: profile?.launchPreference || 'Home', interests: chosen.map(x=>x.Interest.name), saved: saved.map(x=>x.eventID), categories: interests.map(x=>x.name), admins: admins.map(x=>({id:x.orgID,name:x.Organization.orgName})), events: events.map(e=>({id:e.eventID,name:e.name,org:e.Organization.orgName,orgID:e.orgID,genres:e['Event Interests'].map(x=>x.Interest.name),genre:e['Event Interests'][0]?.Interest.name || '',type:e.type,time:e.time,date:e.date,location:e.location,desc:e.description || '',custom:admins.some(a=>a.orgID===e.orgID)})) });
  } catch (error) { next(error); }
});
app.post('/api/action', async (req,res,next) => {
  try {
    const { action, payload } = req.body;
    const functions = { profile:'save_profile', interests:'save_interests', launch:'save_launch', save:'save_event', event:'create_event', delete:'cancel_event' };
    if (!functions[action]) return res.status(400).json({ error:'Unknown action.' });
    check(await req.db.rpc(functions[action], { payload }));
    res.json({ ok:true });
  } catch(error) { next(error); }
});
app.get('/', (req,res)=>res.sendFile(root+'index.html'));
app.use('/js', express.static(root+'js'));
app.use('/css', express.static(root+'css'));
app.use((error,req,res,next)=> { console.error(error.message); res.status(400).json({error:error.message || 'Unable to complete the request.'}); });
app.listen(Number(process.env.PORT || 3000), ()=>console.log('Cougar Connect: http://localhost:'+(process.env.PORT || 3000)));
