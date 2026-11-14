/* Editable document snapshots and serialized draft persistence. No session data. */
(function (root) {
  const keys = ['name','theme_config','schema_json','pages','active_page_id','meta_config','meta_title','meta_description','meta_keywords','og_image','ga_tracking_id','custom_head_code','custom_body_code'];
  function snapshot(site) {
    const value = {};
    for (const key of keys) if (site[key] !== undefined) value[key] = JSON.parse(JSON.stringify(site[key]));
    const active = value.pages?.find(page => page.id === value.active_page_id);
    if (active) active.schema_json = value.schema_json || [];
    return JSON.stringify(value);
  }
  function restore(site, serialized) {
    const value = JSON.parse(serialized);
    for (const key of keys) { delete site[key]; if (value[key] !== undefined) site[key] = value[key]; }
    return site;
  }
  function createSaver(send) {
    let pending = null, running = null;
    return function save(payload) {
      pending = JSON.parse(JSON.stringify(payload));
      if (!running) running = (async () => {
        try {
          while (pending) { const next = pending; pending = null; await send(next); }
        } finally { running = null; pending = null; }
      })();
      return running;
    };
  }
  function reindexFormats(component, oldIds) {
    for (const field of ['field_formats','image_formats']) {
      const result = {};
      for (const [key,value] of Object.entries(component[field]||{})) {
        let path;try {path=JSON.parse(key);}catch(_){result[key]=value;continue;}
        if(path[0]!=='nodes'){result[key]=value;continue;}
        const id=oldIds[Number(path[1])];
        component.data.nodes.forEach((node,index)=>{if(node.id===id||node.copiedFrom===id)result[JSON.stringify(['nodes',String(index),...path.slice(2)])]=JSON.parse(JSON.stringify(value));});
      }
      component[field]=result;
    }
    component.data.nodes.forEach(node=>delete node.copiedFrom);
  }
  const api = { snapshot, restore, createSaver, reindexFormats };
  if (typeof module === 'object') module.exports = api;
  else root.StudioState = api;
})(typeof globalThis === 'object' ? globalThis : this);
