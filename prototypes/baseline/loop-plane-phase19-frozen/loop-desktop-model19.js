/* Local review model: matches the app controller's offset grouping and deduplication. */
(function(root){
  const key=t=>`${t.id}|${t.deadlineAt}|${t.deadlineTime||'18:00'}|${t.deadlineReminderMinutes}`;
  function groups(tasks,now,sent){
    const result=new Map();
    for(const t of tasks){
      if(t.kind==='quick'||t.done||!t.deadlineAt||t.deadlineReminderMinutes==null)continue;
      const minutes=Number(t.deadlineReminderMinutes),delta=new Date(t.deadlineAt+'T'+(t.deadlineTime||'18:00'))-new Date(now);
      if(!Number.isFinite(delta)||delta>minutes*60000||sent.has(key(t)))continue;
      const stage=delta<=0?'overdue':'upcoming',id=stage+':'+minutes;
      if(!result.has(id))result.set(id,{stage,minutes,tasks:[]});
      result.get(id).tasks.push(t);
    }
    return [...result.values()];
  }
  const offset=n=>n===0?'截止时':n<60?n+' 分钟':n<1440?n/60+' 小时':n<10080?n/1440+' 天':n/10080+' 周';
  function copy(g){const subject=g.tasks.length>1?g.tasks.length+' 项任务':'「'+g.tasks[0].title+'」';return g.stage==='overdue'?{title:'任务已到截止时间',body:subject+'尚未完成，请尽快处理。'}:{title:'任务截止提醒',body:subject+'将在 '+offset(g.minutes)+'内截止。'};}
  function reconcile(tasks,sent){
    const current=new Set(tasks.filter(t=>t.kind!=='quick'&&!t.done&&t.deadlineAt&&t.deadlineReminderMinutes!=null).map(key));
    for(const entry of sent)if(!current.has(entry))sent.delete(entry);
  }
  const api={key,groups,copy,reconcile};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.loopDesktopModel19=api;
})(typeof globalThis!=='undefined'?globalThis:this);
