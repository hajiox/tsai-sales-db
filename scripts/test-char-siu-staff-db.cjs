'use strict';
// Isolated PostgreSQL only. No configuration files, external APIs, or credentials are read.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const isolated = require('./isolated-char-siu-pg.cjs');
const uuid = () => crypto.randomUUID();
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const materialKeys = ['pork_belly','green_onion','ginger','soy_sauce','sake','haimi','granulated_sugar'];
const outputKeys = ['chashu_wakeari_800','chashu_slice_700','retort_thick_600','retort_medium_380','retort_cut_600','block','lard','minced_chashu'];
const actor = { device: 'fixture-device-01', name: '試験担当' };
const input = complete => ({ productionDate:'2026-10-14',packagingDate:complete?'2026-10-15':null,cookingWorkerCount:2,cookingWorkHours:3,
  packagingWorkerCount:complete?1:null,packagingWorkHours:complete?2:null,
  materials:materialKeys.map(key=>({key,usageAmount:key==='pork_belly'?1000:0})),
  outputs:outputKeys.map(key=>({key,quantity:complete?(key==='block'?1:0):null})),notes:'isolated fixture' });
const applySql = 'SELECT public.char_siu_staff_apply($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS result';
async function apply(db,connection,action,draft,revision,data=null,photos=[],op=uuid(),h=null,who=actor) {
  const requestHash=h||hash({action,draft,revision,data,photos,who});
  return (await db.query(applySql,[connection,who.device,who.name,action,op,revision,draft,requestHash,data,JSON.stringify(photos)])).rows[0].result;
}
async function snapshot(db) {
  const names=['char_siu_staff_drafts','char_siu_staff_operations','char_siu_staff_photos','char_siu_production_runs','char_siu_production_materials','char_siu_production_outputs','char_siu_delivery_note_scans'];
  const result={}; for(const table of names) result[table]=(await db.query(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb) AS rows FROM public.${table} t`)).rows[0].rows;
  return result;
}
async function denied(db,fn,code) { const before=await snapshot(db); await assert.rejects(fn,error=>error.message===`CSP_${code}`); assert.deepEqual(await snapshot(db),before,`Failure ${code} must have zero effects`); }
async function createComplete(db,c) { const saved=await apply(db,c,'saveDraft',null,0,input(true)); return apply(db,c,'submit',saved.draft.id,saved.draft.revision); }
async function scan(db,date='2026-10-14') {
  return (await db.query("INSERT INTO public.char_siu_delivery_note_scans(status,source_kind,target_production_date,reviewed_at,extracted_items,updated_at) VALUES('ready','doc_scanner',$1,clock_timestamp(),$2,'2026-10-14 01:02:03.123456+00') RETURNING id,updated_at::text AS stamp,extracted_items",[date,JSON.stringify([{materialKey:'pork_belly',purchasePriceTaxIncluded:100}])])).rows[0];
}
function financialPayload(draft) {
  const id=uuid(),i=draft.input;
  const run={id,production_date:i.productionDate,packaging_date:i.packagingDate,worker_count:i.cookingWorkerCount,work_hours:i.cookingWorkHours,
    cooking_worker_count:i.cookingWorkerCount,cooking_work_hours:i.cookingWorkHours,packaging_worker_count:i.packagingWorkerCount,packaging_work_hours:i.packagingWorkHours,
    hourly_wage:1000,total_person_hours:8,material_cost:100,labor_cost:8000,total_cost:8100,total_output_quantity:1,total_output_weight_g:1000,
    average_cost_per_item:8100,average_cost_per_kg:8100,notes:i.notes,labor_rate_staff_count:2,labor_rate_excluded_count:0,labor_rate_source:'tsg_fixture',labor_rate_synced_at:null};
  const materials=i.materials.map((r,index)=>({run_id:id,material_key:r.key,ingredient_id:null,material_name:r.key,usage_amount:r.usageAmount??0,
    usage_unit:['soy_sauce','sake'].includes(r.key)?'ml':'g',purchase_unit_quantity:1000,purchase_price_tax_included:100,unit_cost:.1,
    material_cost:(r.usageAmount??0)*.1,sort_order:index+1,price_source:index<3?'delivery_note_ai':'recipe_master',source_reference:null,source_confidence:null,source_note:null}));
  const outputs=i.outputs.map((r,index)=>({run_id:id,output_key:r.key,recipe_id:null,output_name:r.key,quantity:r.quantity??0,unit_weight_g:1000,
    output_weight_g:(r.quantity??0)*1000,allocation_ratio:r.quantity?1:0,allocated_cost:r.quantity?8100:0,unit_cost:r.quantity?8100:null,sort_order:index+1}));
  return {run,materials,outputs};
}
const finalizeSql='SELECT public.char_siu_staff_finalize($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) AS result';
async function finalize(db,draft,s,payload=financialPayload(draft),op=uuid(),h=null) {
  return (await db.query(finalizeSql,[draft.id,draft.revision,op,h||hash({draftId:draft.id,revision:draft.revision,scan:s.id}), 'fixture-manager',s.id,s.stamp,
    JSON.stringify(s.extracted_items),JSON.stringify(payload.run),JSON.stringify(payload.materials),JSON.stringify(payload.outputs)])).rows[0].result;
}

isolated('202610140003_char_siu_staff_production.sql',async(db,{newClient})=>{
  let rejected=0;
  const c=uuid(),other=uuid(),revoked=uuid(),expired=uuid();
  await db.query('INSERT INTO public.char_siu_staff_connections(id,label,token_hash,allowed_device_ids,allowed_operator_names) VALUES($1,$2,$3,$4,$5),($6,$7,$8,NULL,NULL)',[c,'fixture',hash(c),[actor.device],[actor.name],other,'other',hash(other)]);
  await db.query("INSERT INTO public.char_siu_staff_connections(id,label,token_hash,revoked_at) VALUES($1,'revoked',$2,now())",[revoked,hash(revoked)]);
  await db.query("INSERT INTO public.char_siu_staff_connections(id,label,token_hash,expires_at) VALUES($1,'expired',$2,now()-interval '1 second')",[expired,hash(expired)]);
  const tables=(await db.query("SELECT c.relname,c.relrowsecurity,has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS anon,has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS authenticated FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname LIKE 'char_siu_staff_%' AND c.relkind='r' ORDER BY c.relname")).rows;
  assert.equal(tables.length,4); tables.forEach(t=>{assert.equal(t.relrowsecurity,true);assert.equal(t.anon,false);assert.equal(t.authenticated,false);});
  const functions=(await db.query("SELECT p.proname,p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'EXECUTE') AS anon,has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated,has_function_privilege('service_role',p.oid,'EXECUTE') AS service FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'char_siu_staff_%' ORDER BY p.proname")).rows;
  assert.equal(functions.length,6);functions.forEach(f=>{assert.equal(f.prosecdef,true);assert.deepEqual(f.proconfig,['search_path=""']);assert.equal(f.anon,false);assert.equal(f.authenticated,false);assert.equal(f.service,true);});
  for(const role of ['anon','authenticated']) {
    const connection=await newClient();try { await connection.query(`SET ROLE ${role}`);await assert.rejects(()=>connection.query('SELECT * FROM public.char_siu_staff_drafts'),e=>e.code==='42501');await assert.rejects(()=>apply(connection,c,'saveDraft',null,0,input(false)),e=>e.code==='42501'); } finally{await connection.end();}
  }
  const bucket=(await db.query("SELECT public,file_size_limit,allowed_mime_types FROM storage.buckets WHERE id='char-siu-production-photos'")).rows[0];assert.equal(bucket.public,false);assert.equal(Number(bucket.file_size_limit),3145728);assert.equal(bucket.allowed_mime_types.length,5);
  await db.query('BEGIN');
  try {
    await db.query("UPDATE storage.buckets SET public=true WHERE id='char-siu-production-photos'; SAVEPOINT mismatched_bucket");
    await assert.rejects(()=>db.query(fs.readFileSync(path.join(__dirname,'..','supabase','migrations','202610140003_char_siu_staff_production.sql'),'utf8')),e=>e.message==='CSP_BUCKET_CONFIG_CONFLICT');
    await db.query('ROLLBACK TO SAVEPOINT mismatched_bucket');
    assert.equal((await db.query("SELECT public FROM storage.buckets WHERE id='char-siu-production-photos'")).rows[0].public,true,'Migration must refuse rather than silently change existing bucket metadata');
  } finally {await db.query('ROLLBACK');}
  for(const connection of [revoked,expired,uuid()]) {await denied(db,()=>apply(db,connection,'saveDraft',null,0,input(false)),'UNAUTHORIZED');rejected++;}
  for(const who of [{...actor,device:'unlisted-device'},{...actor,name:'別担当者'},{...actor,name:'不正\n担当'}]) {await denied(db,()=>apply(db,c,'saveDraft',null,0,input(false),[],uuid(),null,who),'FORBIDDEN');rejected++;}
  const op=uuid(),h=hash('initial');const saved=await apply(db,c,'saveDraft',null,0,input(false),[],op,h);
  assert.equal(saved.draft.revision,1);assert.equal(saved.draft.status,'draft');assert.equal(saved.draft.input.packagingWorkerCount,null);
  const beforeReplay=await snapshot(db),replayed=await apply(db,c,'saveDraft',null,0,input(false),[],op,h);assert.equal(replayed.replay,true);assert.equal(replayed.draft.id,saved.draft.id);assert.deepEqual(await snapshot(db),beforeReplay);
  await denied(db,()=>apply(db,c,'saveDraft',null,0,input(false),[],op,hash('changed')),'IDEMPOTENCY_CONFLICT');rejected++;
  await denied(db,()=>apply(db,other,'saveDraft',saved.draft.id,1,input(true)),'NOT_FOUND');rejected++;
  await denied(db,()=>apply(db,c,'submit',saved.draft.id,1),'NOT_READY');rejected++;
  await denied(db,()=>apply(db,c,'saveDraft',saved.draft.id,0,input(true)),'REVISION_CONFLICT');rejected++;
  const bad=[{...input(false),productionDate:'2026-02-30'},{...input(false),packagingDate:'2026-10-13'},
    {...input(false),cookingWorkerCount:1.5},{...input(false),cookingWorkHours:0},{...input(false),hourlyWage:1},
    {...input(false),materials:[...input(false).materials.slice(1),input(false).materials[1]]},
    {...input(false),outputs:input(false).outputs.map((r,i)=>i? r:{...r,quantity:0.5})}];
  for(const data of bad){await denied(db,()=>apply(db,c,'saveDraft',null,0,data),'INVALID_INPUT');rejected++;}
  // Two independently connected transactions contend for one revision; one alone can win.
  const a=await newClient(),b=await newClient();try{
    const outcomes=await Promise.allSettled([apply(a,c,'saveDraft',saved.draft.id,1,input(true)),apply(b,c,'saveDraft',saved.draft.id,1,input(true))]);
    assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.equal(outcomes.filter(r=>r.status==='rejected'&&r.reason.message==='CSP_REVISION_CONFLICT').length,1);
  }finally{await a.end();await b.end();}
  const current=(await db.query('SELECT * FROM public.char_siu_staff_drafts WHERE id=$1',[saved.draft.id])).rows[0];
  const photoOp=uuid(),photoHash=hash('photo'),metadata=[{fileName:'fixture.png',mimeType:'image/png',size:20,sha256:hash('photo bytes')},{fileName:'second.jpg',mimeType:'image/jpeg',size:30,sha256:hash('second photo bytes')}];
  const reserved=await apply(db,c,'reservePhotos',current.id,current.revision,null,metadata,photoOp,photoHash);assert.equal(reserved.processing,true);assert.equal(reserved.claimed,true);assert.equal(reserved.photos.length,2);assert.deepEqual(reserved.photos.map(p=>p.sha256),metadata.map(p=>p.sha256));
  const photoBefore=await snapshot(db);const pending=await apply(db,c,'reservePhotos',current.id,current.revision,null,metadata,photoOp,photoHash);assert.equal(pending.claimed,false);assert.equal(pending.processing,true);assert.deepEqual(await snapshot(db),photoBefore);
  await denied(db,()=>apply(db,c,'submit',current.id,reserved.draft.revision),'IN_PROGRESS');rejected++;
  const finishArgs=[c,actor.device,actor.name,reserved.operationId,reserved.draft.revision,reserved.scanId,'[]',null,'AI_REVIEW_REQUIRED'];
  const finishSql='SELECT public.char_siu_staff_finish_photos($1,$2,$3,$4,$5,$6,$7,$8,$9) AS result';
  await denied(db,()=>db.query(finishSql,[...finishArgs.slice(0,4),current.revision,...finishArgs.slice(5)]),'REVISION_CONFLICT');rejected++;
  const finished=(await db.query(finishSql,finishArgs)).rows[0].result;assert.equal(finished.processing,false);assert.equal(finished.draft.pending_operation_id,null);assert.equal(finished.draft.revision,reserved.draft.revision+1);assert.equal(finished.photos[0].status,'needs_review');
  assert.equal((await db.query('SELECT status FROM public.char_siu_delivery_note_scans WHERE id=$1',[reserved.scanId])).rows[0].status,'needs_review');
  const finishedBefore=await snapshot(db),finishReplay=(await db.query(finishSql,finishArgs)).rows[0].result;assert.equal(finishReplay.replay,true);assert.deepEqual(await snapshot(db),finishedBefore);
  const afterPhoto=await apply(db,c,'reservePhotos',current.id,current.revision,null,metadata,photoOp,photoHash);assert.equal(afterPhoto.processing,false);assert.equal(afterPhoto.replay,true);
  for(const photos of [[...metadata,...metadata,...metadata,...metadata,...metadata],[{...metadata[0],size:3145729}],[{...metadata[0],size:2000000},{...metadata[1],size:2000000}],[{...metadata[0],mimeType:'text/html'}],[{...metadata[0],storagePath:'arbitrary'}]]){
    await denied(db,()=>apply(db,c,'reservePhotos',current.id,finished.draft.revision,null,photos),'INVALID_INPUT');rejected++;
  }
  const submitted=await apply(db,c,'submit',current.id,finished.draft.revision);assert.equal(submitted.draft.status,'needs_review');
  const ready=await scan(db),payload=financialPayload(submitted.draft);
  await denied(db,()=>finalize(db,submitted.draft,{...ready,stamp:new Date(ready.stamp).toISOString()},payload),'NOT_READY');rejected++;
  const badPayload=structuredClone(payload);badPayload.materials[6].usage_amount=1;
  await denied(db,()=>finalize(db,submitted.draft,ready,badPayload),'INVALID_INPUT');rejected++;
  // Price changes between JS preparation and the locked SQL snapshot must refuse old costs.
  await db.query('UPDATE public.char_siu_delivery_note_scans SET extracted_items=$1 WHERE id=$2',[JSON.stringify([{materialKey:'pork_belly',purchasePriceTaxIncluded:101}]),ready.id]);
  await denied(db,()=>finalize(db,submitted.draft,ready,payload),'NOT_READY');rejected++;
  const freshScan=(await db.query('SELECT id,updated_at::text AS stamp,extracted_items FROM public.char_siu_delivery_note_scans WHERE id=$1',[ready.id])).rows[0];
  // Force a late child insert failure: no partial run, children, operation or scan/draft update survives.
  const fkPayload=structuredClone(payload);fkPayload.outputs[0].recipe_id=uuid();const beforeFailure=await snapshot(db);
  await assert.rejects(()=>finalize(db,submitted.draft,freshScan,fkPayload),e=>e.code==='23503');assert.deepEqual(await snapshot(db),beforeFailure);rejected++;
  const finalizeOp=uuid(),finalizeHash=hash('finalize');const completed=await finalize(db,submitted.draft,freshScan,payload,finalizeOp,finalizeHash);
  assert.equal(completed.draft.status,'completed');assert.equal(completed.draft.run_id,payload.run.id);
  assert.equal((await db.query('SELECT count(*)::int n FROM public.char_siu_production_materials WHERE run_id=$1',[payload.run.id])).rows[0].n,7);
  assert.equal((await db.query('SELECT count(*)::int n FROM public.char_siu_production_outputs WHERE run_id=$1',[payload.run.id])).rows[0].n,8);
  assert.equal((await db.query('SELECT used_run_id FROM public.char_siu_delivery_note_scans WHERE id=$1',[ready.id])).rows[0].used_run_id,payload.run.id);
  const completedBefore=await snapshot(db);const changedCost=financialPayload(submitted.draft);changedCost.run.total_cost=99999;
  const completedReplay=await finalize(db,submitted.draft,freshScan,changedCost,finalizeOp,finalizeHash);assert.equal(completedReplay.replay,true);assert.equal(completedReplay.draft.run_id,payload.run.id);assert.deepEqual(await snapshot(db),completedBefore);
  const audit=(await db.query('SELECT device_id,operator_name,draft_revision,input_snapshot,manager_actor FROM public.char_siu_staff_operations WHERE client_operation_id=$1',[finalizeOp])).rows[0];
  assert.equal(audit.device_id,actor.device);assert.equal(audit.operator_name,actor.name);assert.equal(audit.draft_revision,completed.draft.revision);assert.deepEqual(audit.input_snapshot,submitted.draft.input);assert.equal(audit.manager_actor,'fixture-manager');
  await denied(db,()=>finalize(db,submitted.draft,freshScan),'COMPLETED');rejected++;
  await denied(db,()=>apply(db,c,'saveDraft',completed.draft.id,completed.draft.revision,input(true)),'COMPLETED');rejected++;
  const concurrentDraft=(await createComplete(db,c)).draft,concurrentScan=await scan(db),x=await newClient(),y=await newClient();try{
    const outcomes=await Promise.allSettled([finalize(x,concurrentDraft,concurrentScan),finalize(y,concurrentDraft,concurrentScan)]);
    assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.equal(outcomes.filter(r=>r.status==='rejected'&&r.reason.message==='CSP_COMPLETED').length,1);
  }finally{await x.end();await y.end();}
  // Stage precision survives the compatibility column's existing two-decimal storage.
  const decimalInput=input(true);decimalInput.cookingWorkHours=3.1234;decimalInput.packagingWorkHours=2.3456;
  const decimalSaved=await apply(db,c,'saveDraft',null,0,decimalInput),decimalSubmitted=await apply(db,c,'submit',decimalSaved.draft.id,1);
  const decimalPayload=financialPayload(decimalSubmitted.draft);decimalPayload.run.total_person_hours=8.59;
  const decimalDone=await finalize(db,decimalSubmitted.draft,await scan(db),decimalPayload);
  const decimalRow=(await db.query('SELECT work_hours::text,cooking_work_hours::text,packaging_work_hours::text FROM public.char_siu_production_runs WHERE id=$1',[decimalDone.draft.run_id])).rows[0];
  assert.deepEqual(decimalRow,{work_hours:'3.12',cooking_work_hours:'3.1234',packaging_work_hours:'2.3456'});
  const failedDraft=await apply(db,c,'saveDraft',null,0,input(false)),failedOp=uuid(),failedHash=hash('failed upload');
  const failedReserve=await apply(db,c,'reservePhotos',failedDraft.draft.id,1,null,metadata,failedOp,failedHash);
  const failedFinish=(await db.query(finishSql,[c,actor.device,actor.name,failedReserve.operationId,failedReserve.draft.revision,failedReserve.scanId,'[]',null,'UPLOAD_FAILED'])).rows[0].result;
  assert.equal(failedFinish.errorCode,'UPLOAD_FAILED');assert.equal(failedFinish.draft.pending_operation_id,null);assert.ok(failedFinish.photos.every(p=>p.status==='error'));
  assert.equal((await db.query('SELECT status FROM public.char_siu_delivery_note_scans WHERE id=$1',[failedReserve.scanId])).rows[0].status,'error');
  const failedSnapshot=await snapshot(db),failedReplay=await apply(db,c,'reservePhotos',failedDraft.draft.id,1,null,metadata,failedOp,failedHash);
  assert.equal(failedReplay.errorCode,'UPLOAD_FAILED');assert.equal(failedReplay.claimed,false);assert.equal(failedReplay.processing,false);assert.deepEqual(await snapshot(db),failedSnapshot);
  // Existing manager deletion may remove a run, while the immutable staff audit remains completed.
  await db.query('DELETE FROM public.char_siu_production_runs WHERE id=$1',[payload.run.id]);
  const history=(await db.query('SELECT status,run_id FROM public.char_siu_staff_drafts WHERE id=$1',[completed.draft.id])).rows[0];assert.equal(history.status,'completed');assert.equal(history.run_id,payload.run.id);
  return {newTablesRlsServiceOnly:true,newFunctionsSearchPathEmptyServiceOnly:true,anonymousAndAuthenticatedDenied:true,privateBucket:true,mismatchedExistingBucketRefused:true,
    incompleteDraftAllowed:true,connectionActorIsolation:true,casConcurrentSingleWinner:true,replayBeforeCas:true,photoReservationNoDuplicate:true,
    pendingPhotoBlocksMutation:true,photoRevisionCas:true,photoAlwaysManagerReview:true,scanPriceRaceRefused:true,lateChildFailureAtomicRollback:true,
    finalizationNoDoubleRun:true,finalizationReplayNoRecalculation:true,operationActorInputAudit:true,stagePrecisionPreserved:true,rawTimestampMicrosecondsRequired:true,
    uploadFailureReleasedAndReplayFixed:true,deletedRunAuditPreserved:true,rejectedCases:rejected};
}).catch(error=>{process.stderr.write(`${error.stack}\n`);process.exitCode=1;});
