# Companion v1 HTTP contract
All routes /api/companion; JSON fields camelCase; errors {error:{code,message}}. Existing PlatformClient used for login/register/logout/me/external AI consent/ASR. POST/PUT/PATCH/DELETE use X-CSRF-Token and X-Game-Client:same-origin, Content-Type application/json, same-origin credentials.
GET /api/health -> {ok:true,capabilities:{companion:true}}.
GET /api/companion -> {consent:boolean, policyVersion:'2026-09-06-companion-v1', story:null|Story, imageEnabled:boolean, imageRemaining:number, jobs:[], usage:{...}}.
PUT /api/companion/consent {accepted:boolean,policyVersion} -> {consent:boolean}. Stores separate companion consent; frontend also uses PlatformClient.setExternalAiConsent with /api/me externalAiConsent.policyVersion before model calls.
POST /api/companion/draft {description,age:18..100,locale:'zh'|'en'} -> {character:{name,age,description,appearance,personality,world,opening},sceneTitles:[3 strings]}. User may edit these fields before story creation. Consumes text quota.
POST /api/companion/stories {character:{name,age,description,appearance,personality,world,opening},locale,adultConfirmed:true} -> {story}.
Story = {id,revision:1,version:number,locale,character,stage:'meeting'|'familiar'|'flirting'|'together',scene:0..2,sceneTitles:[...],choices:[{id,label}],turns:[{id,role:'user'|'assistant',content,createdAt}],memories:[{id,content,sourceTurnId,createdAt}],assets:[{id,kind:'portrait'|'scene',scene:number,url}],createdAt}.
POST /api/companion/stories/:id/turn {clientTurnId:UUID,expectedVersion:number,text:string,choiceId?:string} -> SSE events:
 event: delta data: {text:'incremental fragment'}
 event: done data: {story:Story}
 event: error data: {code,message}
Exactly one completed done required; client must retain its unsent input on errors and incomplete stream. Replay of identical clientTurnId returns same completed reply (delta full, then done); reject changed content/version collision. Busy 409. Explicit selected choices advance deterministic scenes, ordinary messages do not.
POST /api/companion/stories/:id/memories {content,sourceTurnId} -> {story}; source must be existing turn.
PATCH /api/companion/stories/:id/memories/:memoryId {content} -> {story}.
DELETE /api/companion/stories/:id/memories/:memoryId -> {story}.
DELETE /api/companion/stories/:id -> {deleted:true}; confirmation required client-side. New story can then be created. First-release one active story; archive/restart later.
POST /api/companion/stories/:id/images {kind:'portrait'|'scene',scene:0..2,clientJobId:UUID} -> {job}; optional image service may return image_not_configured/image_quota_exhausted. Quota per account default 0 configured in server env.
GET /api/companion/jobs/:id -> {job,story}; job {id,status:'queued'|'running'|'succeeded'|'failed'|'cancelled',createdAt,errorCode?,assetId?}. Poll 3s while active only; >60s show wait/cancel.
DELETE /api/companion/jobs/:id -> {job}. Never fake images. Asset authenticated URL /api/companion/assets/:id. Success result is visible preview; POST /api/companion/stories/:id/images/:assetId/confirm -> {story} sets approved portrait/background. Failed jobs leave previous approved images intact.
No TTS endpoints. Voice: existing PlatformClient transcribeVoice(audioBase64,'wav',{priority:'final',signal,...}) actual signature must inspect; use MediaRecorder or PCM capture to supported format. Manual stop, local waveform/time, then transcription into editable draft only. New entry does not require live ASR. Aborted/stale result must never replace manual edit.
