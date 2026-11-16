'use strict';
/* DAYAMS Boutique — sitio estático. El catálogo y las fotografías se publican con Pages CMS.
   El navegador guarda solamente bolsa/favoritos. Sin base de datos no hay reservas,
   ventas confirmadas automáticas ni comprobación automática de pagos por Yape. */
(()=>{
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon=name=>`<svg class="ico" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
  const money=n=>`S/ ${Number(n||0).toFixed(2)}`;
  const num=(n,defaultValue=0)=>Number.isFinite(Number(n))?Number(n):defaultValue;
  const int=(n,min=0)=>Math.max(min,Math.floor(num(n)));
  const csv=v=>(Array.isArray(v)?v:String(v||'').split(',')).map(x=>String(x??'').trim()).filter(Boolean);
  const phone=v=>String(v||'').replace(/\D/g,'');
  const CART_KEY='dayams_cart_v3', FAV_KEY='dayams_favorites_v3', CACHE_KEY='dayams_catalog_lastgood_v3';
  const state={catalog:null,cart:[],favorites:new Set(),category:'Todas',colorFilter:'',search:'',sort:'featured',onlyFavorites:false,dialog:null,detail:null,focusBefore:null,lastLoaded:0,refreshing:false};
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let defaultHeroPicture='';
  const fallbackFAQ=[
    {question:'¿Cómo compro?',answer:'Elige las prendas, talla y color, agrégalas a tu bolsa y envía el pedido por WhatsApp. Confirmaremos disponibilidad antes de pagar.'},
    {question:'¿Cómo pago con Yape?',answer:'El pago es exclusivo por Yape. Después de confirmar tu pedido, te compartiremos el número o QR por WhatsApp.'},
    {question:'¿Hacen envíos a provincias?',answer:'Sí. Coordinamos la agencia, el costo y el tiempo estimado de entrega por WhatsApp antes de pagar.'},
    {question:'¿El carrito reserva mi prenda?',answer:'No. Sin reservas automáticas: la disponibilidad final se confirma por WhatsApp.'}
  ];
  function safeHttps(raw){try{const url=new URL(String(raw||''));return url.protocol==='https:'?url.href:''}catch{return ''}}
  function imageURL(raw){
    const path=String(raw??'').trim();if(!path)return '';
    if(/^https:\/\//i.test(path))return safeHttps(path);
    // Pages CMS escribe /images/archivo.jpg; en GitHub Pages este / apunta a la raíz
    // del DOMINIO, no a /repositorio/. Se transforma a una URL RELATIVA al proyecto.
    let relative=path.replace(/^\/+/, '').replace(/^\.\//,'');
    if(!/^(?:images|media)\/[\p{L}\p{N}_ .%()\-\/]+\.(?:jpe?g|png|webp|gif|avif)$/iu.test(relative))return '';
    if(relative.split('/').some(part=>part==='..'||part===''))return '';
    try{return new URL(relative,document.baseURI).href}catch{return ''}
  }
  function picMarkup(source,alt,cls='product-photo',eager=false){
    const url=imageURL(source);
    const fallback=`<div class="photo-fallback" ${url?'hidden':''}><strong>Dayams</strong><span>YOUR LOOK, YOUR RULES ✳</span></div>`;
    return (url?`<img class="${cls}" src="${esc(url)}" alt="${esc(alt)}" loading="${eager?'eager':'lazy'}" decoding="async" ${eager?'fetchpriority="high"':''}>`:'')+fallback;
  }
  function notice(text){const t=$('toastRoot');t.textContent=text;t.classList.add('show');clearTimeout(notice.timer);notice.timer=setTimeout(()=>t.classList.remove('show'),3700)}
  function productById(id){return state.catalog?.products.find(p=>p.id===String(id))}
  function productStock(p){return int(p?.stock||0)}
  function isActive(p){return p.active!==false}
  function settings(){return state.catalog?.settings||{}}
  function totalQty(){return state.cart.reduce((total,x)=>total+x.qty,0)}
  function used(id){return state.cart.filter(x=>x.id===id).reduce((n,x)=>n+x.qty,0)}
  function wholesaleMin(){return Math.max(2,int(settings().wholesale_min||4))}
  function eligible(){return settings().wholesale_enabled!==false&&totalQty()>=wholesaleMin()}
  function priceFor(p){return eligible()&&p.wholesale>0&&p.wholesale<p.price?p.wholesale:p.price}
  function subtotal(){return state.cart.reduce((total,x)=>{const p=productById(x.id);return p?total+priceFor(p)*x.qty:total},0)}
  function baseTotal(){return state.cart.reduce((total,x)=>{const p=productById(x.id);return p?total+p.price*x.qty:total},0)}
  function saveCart(){try{localStorage.setItem(CART_KEY,JSON.stringify(state.cart))}catch{ /* Puede estar bloqueado: la compra de esta sesión sigue funcionando. */ }updateBadges()}
  function saveFavorites(){try{localStorage.setItem(FAV_KEY,JSON.stringify([...state.favorites]))}catch{}updateBadges()}
  function readStorage(){
    try{const raw=JSON.parse(localStorage.getItem(CART_KEY)||'[]');if(Array.isArray(raw))state.cart=raw.filter(x=>x&&typeof x.id==='string'&&typeof x.size==='string'&&typeof x.color==='string'&&Number.isInteger(x.qty)&&x.qty>0).slice(0,50)}catch{}
    try{const raw=JSON.parse(localStorage.getItem(FAV_KEY)||'[]');if(Array.isArray(raw))state.favorites=new Set(raw.filter(x=>typeof x==='string').slice(0,200))}catch{}
  }
  function reconcile(){
    const usage=new Map();const cleaned=[];
    for(const item of state.cart){
      const p=productById(item.id);if(!p||!isActive(p)||!productStock(p))continue;
      if(!p.sizes.includes(item.size)||!p.colors.includes(item.color))continue;
      const left=productStock(p)-(usage.get(item.id)||0);
      if(left<=0)continue;
      const qty=Math.min(Math.max(1,int(item.qty,1)),left);
      cleaned.push({id:item.id,size:item.size,color:item.color,qty});usage.set(item.id,(usage.get(item.id)||0)+qty);
    }
    state.cart=cleaned;saveCart();
  }
  function updateBadges(){
    const c=totalQty();$('cartBadge').textContent=c;$('floatCount').textContent=c;
    const f=state.favorites.size;$('favoriteBadge').textContent=f;$('favoriteBadge').classList.toggle('hidden',f===0);
    $('favoritesButton').classList.toggle('pressed',state.onlyFavorites);$('favoritesButton').setAttribute('aria-pressed',state.onlyFavorites?'true':'false');
  }
  function cleanProduct(p){
    if(!p||typeof p!=='object')return null;
    const id=String(p.id||'').trim(),name=String(p.name||'').trim();if(!id||!name)return null;
    const price=Math.max(0,num(p.price)),wholesale=Math.max(0,num(p.wholesale));
    return {...p,id,name,active:p.active!==false,price,wholesale,stock:productStock(p),sizes:csv(p.sizes).length?csv(p.sizes):['Única'],colors:csv(p.colors).length?csv(p.colors):['Único'],color_hexes:csv(p.color_hexes),gallery:csv(p.gallery).filter(imageURL)};
  }
  function applyCatalog(data){
    if(!data||typeof data!=='object'||!data.settings||!Array.isArray(data.products))throw new Error('El catálogo JSON no tiene el formato requerido');
    const seen=new Set(),products=[];
    for(const raw of data.products){const p=cleanProduct(raw);if(!p||seen.has(p.id))continue;seen.add(p.id);products.push(p)}
    state.catalog={...data,products};reconcile();
    state.favorites=new Set([...state.favorites].filter(id=>productById(id)));saveFavorites();
    renderStatic();renderFilters();renderProducts();renderCurations();renderColorDiscover();
    $('catalogLoading').classList.add('hidden');state.lastLoaded=Date.now();
    if(state.dialog)closeDialog(false);
    const param=new URL(location.href).searchParams.get('producto');
    if(param&&productById(param)&&!state.openedDeepLink){state.openedDeepLink=true;openProduct(param)}
  }
  function headingHTML(value){const text=String(value||'Tu estilo, tu universo.').trim();const comma=text.indexOf(',');if(comma>0)return `${esc(text.slice(0,comma+1))}<br><em>${esc(text.slice(comma+1).trim())}</em>`;
    const words=text.split(/\s+/);return words.length>1?`${esc(words.slice(0,-1).join(' '))} <em>${esc(words.at(-1))}</em>`:esc(text);
  }
  function renderStatic(){
    const s=settings();document.title=`${String(s.brand||'DAYAMS')} · Boutique`;
    $('announcementText').textContent=s.announcement||'DAYAMS ✦ TU ESTILO, TU ESENCIA';
    $('heroLabel').innerHTML=`<span class="dot"></span> ${esc(s.hero_label||'NUEVA TEMPORADA · TU ESTILO')}`;
    $('heroTitle').innerHTML=headingHTML(s.hero_title);
    $('heroSub').textContent=s.hero_subtitle||'Prendas que hablan de ti.';
    const introText=document.querySelector('.intro-signature');if(introText)introText.textContent=String(s.welcome_line||'Una boutique para brillar a tu manera');
    const editorial=document.querySelector('.editorial-banner p');if(editorial){const phrase=String(s.editorial_title||'Vestirte también es contar tu historia.'); const bits=phrase.match(/^(.*?)(contar.*)$/i);editorial.innerHTML=bits?`${esc(bits[1])}<br><em>${esc(bits[2])}</em>`:esc(phrase)}
    $('catalogDesc').textContent=s.catalog_subtitle||'Una selección especial para ti.';
    $('aboutText').textContent=s.about||'Una boutique creada con amor.';
    $('footerText').textContent=s.footer||'Tu boutique favorita.';
    $('demoWarning').classList.toggle('hidden',s.demo!==true);
    const text=String(s.ticker||'DAYAMS ✳ YOUR LOOK, YOUR RULES ✳ ');$('tickerTrack').textContent=(text+' ').repeat(20);
    const hero=imageURL(s.hero_image);
    $('heroPicture').innerHTML=hero?picMarkup(s.hero_image,'Fotografía de portada DAYAMS','hero-main-photo',true):defaultHeroPicture;
    const firstWithImage=(state.catalog.products||[]).find(p=>p.active!==false&&imageURL(p.image));
    const side=$('heroSecondary');if(side&&firstWithImage){side.classList.add('has-fashion-photo');side.innerHTML=`<div class="hero-secondary-photo">${picMarkup(firstWithImage.image,firstWithImage.name,'hero-secondary-img',true)}</div><span class="hero-secondary-name">${esc(firstWithImage.name)} · DAYAMS</span>`}else if(side){side.classList.remove('has-fashion-photo');side.innerHTML='<span class="mini-polaroid-kicker">THE NEW EDIT</span><div class="little-fashion">✦<br><span>wear<br>your<br><i>magic.</i></span></div><span class="mini-polaroid-end">YOUR LOOK · YOUR STORY</span>'}
    const wa=phone(s.whatsapp),validPhone=wa.length>=10&&wa.length<=15,waHref=validPhone?`https://wa.me/${wa}`:'#coleccion';
    for(const id of ['footerWA','faqWA']){const el=$(id);el.href=waHref;if(!validPhone)el.removeAttribute('target')}
    const socials=[['Instagram',s.instagram],['TikTok',s.tiktok],['Facebook',s.facebook]].filter(x=>safeHttps(x[1]));
    $('socialLinks').innerHTML=socials.map(([name,url])=>`<a href="${esc(safeHttps(url))}" target="_blank" rel="noopener noreferrer">${esc(name)} ↗</a>`).join('');
    const details=[s.business_name?String(s.business_name):'',s.ruc?`RUC ${String(s.ruc)}`:'',s.service_email?String(s.service_email):'',s.service_address?String(s.service_address):''].filter(Boolean);
    $('businessDetails').innerHTML=details.map(x=>`<span>${esc(x)}</span>`).join('');$('businessDetails').classList.toggle('hidden',!details.length);
    const legal=[['Libro de Reclamaciones',s.complaints_url],['Política de privacidad',s.privacy_url],['Términos y condiciones',s.terms_url]].filter(x=>safeHttps(x[1]));
    $('legalLinks').innerHTML=legal.map(([label,url])=>`<a href="${esc(safeHttps(url))}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`).join('');
    const reviews=Array.isArray(state.catalog.reviews)?state.catalog.reviews.filter(r=>r?.published===true&&String(r.name||'').trim()&&String(r.text||'').trim()):[];
    $('reviewsSection').classList.toggle('hidden',!reviews.length);
    $('reviewsGrid').innerHTML=reviews.map(r=>{const rating=Math.max(0,Math.min(5,int(r.rating)));return `<article class="review-card">${rating?`<div class="stars" aria-label="${rating} de 5 estrellas">${'★'.repeat(rating)}${'☆'.repeat(5-rating)}</div>`:''}<p>“${esc(r.text)}”</p><small>— ${esc(r.name)}</small></article>`}).join('');
    const faq=Array.isArray(state.catalog.faq)&&state.catalog.faq.some(f=>f.question&&f.answer)?state.catalog.faq.filter(f=>f.question&&f.answer):fallbackFAQ;
    $('faqList').innerHTML=faq.map(f=>`<details><summary>${esc(f.question)}</summary><p>${esc(f.answer)}</p></details>`).join('');
    setupReveals();
  }
  function filtered(){
    let p=state.catalog?.products.filter(isActive)||[];
    if(state.category!=='Todas')p=p.filter(x=>x.category===state.category);
    if(state.colorFilter)p=p.filter(x=>x.colors.some(c=>c.toLocaleLowerCase('es')===state.colorFilter.toLocaleLowerCase('es')));
    if(state.onlyFavorites)p=p.filter(x=>state.favorites.has(x.id));
    const term=state.search.trim().toLocaleLowerCase('es');
    if(term)p=p.filter(x=>[x.name,x.category,x.description,...x.sizes,...x.colors].some(v=>String(v||'').toLocaleLowerCase('es').includes(term)));
    switch(state.sort){
      case 'new':p.reverse();break;
      case 'low':p.sort((a,b)=>a.price-b.price);break;
      case 'high':p.sort((a,b)=>b.price-a.price);break;
      case 'name':p.sort((a,b)=>a.name.localeCompare(b.name,'es'));break;
    }
    return p;
  }
  function renderFilters(){
    const cats=['Todas',...new Set((state.catalog?.products||[]).filter(isActive).map(p=>String(p.category||'Otros')))];
    if(!cats.includes(state.category))state.category='Todas';
    $('categoryFilters').innerHTML=cats.map(c=>`<button class="chip ${state.category===c?'active':''}" type="button" data-category="${esc(c)}" aria-pressed="${state.category===c}">${esc(c)}</button>`).join('');
  }
  function renderProducts(){
    const area=$('productsGrid'),list=filtered();$('productCounter').textContent=list.length;
    if(!list.length){area.innerHTML=`<div class="empty-products"><h3>Por aquí todavía no hay looks ✳</h3><p>${state.onlyFavorites?'Guarda alguna prenda con el corazón para verla aquí.':'Prueba una categoría diferente o cambia tu búsqueda.'}</p><button type="button" data-clear class="btn btn-outline">Ver todas las prendas ${icon('arrow')}</button></div>`;return}
    area.innerHTML=list.map(p=>{
      const sold=p.stock===0,low=p.stock>0&&p.stock<=3,on=state.favorites.has(p.id);
      const hasWholesale=p.wholesale>0&&p.wholesale<p.price&&settings().wholesale_enabled!==false;
      const message=sold?'Agotado':low?'¡Últimas unidades!':hasWholesale?`Mayor desde ${money(p.wholesale)}`:'Disponible';
      return `<article class="product-card reveal" data-product="${esc(p.id)}"><div class="product-image-wrap">${picMarkup(p.image,p.name)}<span class="product-badge ${sold?'soldout':''}">${esc(sold?'Agotado':p.badge||'DAYAMS')}</span><button type="button" class="card-heart ${on?'on':''}" data-favorite="${esc(p.id)}" aria-label="${on?'Quitar de':'Agregar a'} favoritos: ${esc(p.name)}" aria-pressed="${on}">${icon('heart')}</button><button class="quick-overlay" type="button" data-view="${esc(p.id)}">${sold?'Ver prenda':'Ver detalles'} ${icon('arrow')}</button></div><div class="product-info"><span class="product-category">${esc(p.category||'DAYAMS')}</span><h3 class="product-title">${esc(p.name)}</h3><div class="product-swatches" aria-label="Colores disponibles">${p.colors.slice(0,5).map(c=>`<span class="product-dot" title="${esc(c)}" style="background:${colorChip(c,p)}"></span>`).join('')}${p.colors.length>5?`<span class="product-dot-extra">+${p.colors.length-5}</span>`:''}</div><div class="product-price-row"><div><b class="product-price">${money(p.price)}</b><small class="product-extra ${low?'low':(hasWholesale?'major':'')}">${esc(message)}</small></div><button type="button" class="product-open" data-view="${esc(p.id)}" aria-label="Ver detalles de ${esc(p.name)}">${icon('arrow')}</button></div></div></article>`;
    }).join('');setupReveals();
  }
  function showCatalogError(message){$('connectionWarning').textContent=message;$('connectionWarning').classList.remove('hidden')}
  async function loadCatalog(force=false){
    if(state.refreshing)return;state.refreshing=true;
    const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),14000);
    try{
      const response=await fetch(`catalogo.json?v=${Date.now()}`,{cache:'no-store',signal:ctrl.signal});
      if(!response.ok)throw new Error('HTTP '+response.status);
      const json=await response.json();
      const before=JSON.stringify(state.catalog||{});
      applyCatalog(json);
      try{localStorage.setItem(CACHE_KEY,JSON.stringify(json))}catch{}
      $('connectionWarning').classList.add('hidden');
      if(force)notice(before===JSON.stringify(state.catalog)?'Ya estás viendo la colección más reciente.':'Catálogo actualizado correctamente ✳');
    }catch(error){
      if(!state.catalog){
        let cached;try{cached=JSON.parse(localStorage.getItem(CACHE_KEY)||'null')}catch{}
        if(cached){try{applyCatalog(cached);showCatalogError('No hay conexión para actualizar la tienda. Se muestra una copia anterior guardada en este navegador. Confirma las prendas por WhatsApp.')}catch{}}
        if(!state.catalog){$('catalogLoading').classList.add('hidden');showCatalogError('No se pudo cargar el catálogo. Comprueba tu conexión. Para verlo desde tu computadora, abre la página publicada en GitHub Pages.');$('productsGrid').innerHTML='<div class="empty-products">No pudimos cargar los productos. Prueba el botón «Actualizar catálogo» o vuelve a entrar.</div>'}
      }else{showCatalogError('No se pudo actualizar el catálogo en este momento. Estás viendo la última versión cargada.');if(force)notice('No pudimos actualizar. Comprueba la conexión.')}
      console.error('DAYAMS catálogo:',error);
    }finally{clearTimeout(timeout);state.refreshing=false}
  }
  function setupReveals(){
    const els=document.querySelectorAll('.reveal:not(.visible)');
    if(reducedMotion||!('IntersectionObserver' in window)){els.forEach(e=>e.classList.add('visible'));return}
    if(!setupReveals.observer){setupReveals.observer=new IntersectionObserver(entries=>{for(const item of entries)if(item.isIntersecting){item.target.classList.add('visible');setupReveals.observer.unobserve(item.target)}},{threshold:.07,rootMargin:'0px 0px 80px 0px'})}
    els.forEach(el=>setupReveals.observer.observe(el));
  }
  function dialog(html,mode='detail'){
    state.focusBefore=document.activeElement;state.dialog=mode;
    $('modalRoot').innerHTML=`<div class="overlay" id="overlay"><div class="dialog ${mode==='cart'?'cart-dialog':''}" role="dialog" aria-modal="true" aria-label="${mode==='cart'?'Mi bolsa':'Detalle de prenda'}">${html}</div></div>`;
    document.body.classList.add('locked');$('modalRoot').querySelector('.close')?.focus();
  }
  function closeDialog(restore=true){state.dialog=null;state.detail=null;$('modalRoot').innerHTML='';document.body.classList.remove('locked');if(restore&&state.focusBefore?.isConnected)state.focusBefore.focus()}
  function colorChip(name,product){
    const key=String(name||'').toLocaleLowerCase('es').trim();
    if(product){const i=product.colors.findIndex(c=>c.toLocaleLowerCase('es')===key);const code=product.color_hexes?.[i];if(/^#[0-9a-f]{6}$/i.test(code||''))return code}
    const custom=Array.isArray(settings().color_palette)?settings().color_palette.find(c=>String(c?.name||'').toLocaleLowerCase('es').trim()===key):null;
    if(custom&&/^#[0-9a-f]{6}$/i.test(custom.hex||''))return custom.hex;
    const shades={'negro':'#29252a','blanco':'#f8f5ef','marfil':'#f4eadd','rosa':'#e6aec3','rosa empolvado':'#d9a0b7','lavanda':'#aa92c2','café':'#9c715a','beige':'#e2d4bf','azul':'#7698c2','rojo':'#bf5864','verde':'#91a991','gris':'#ada7ab','vino':'#793850','azul cielo':'#a9c8dd'};
    return shades[key]||'#c9b9c8'
  }
  function renderCurations(){
    const grid=$('editGrid');if(!grid)return;
    const grouped=new Map();for(const product of state.catalog.products.filter(isActive)){
      const category=String(product.category||'Otros');if(!grouped.has(category))grouped.set(category,[]);grouped.get(category).push(product)
    }
    const picks=[...grouped.entries()].sort((a,b)=>b[1].length-a[1].length).slice(0,3);
    const gradients=['linear-gradient(155deg,#cb8f9f,#eed9dc 45%,#a86f8b)','linear-gradient(155deg,#b3a0ae,#ead6c9 50%,#93798b)','linear-gradient(155deg,#d2b5a0,#f2dfcb 48%,#bb8597)'];
    grid.innerHTML=picks.map(([cat,items],i)=>{const image=items.find(p=>imageURL(p.image));const label=cat.toLocaleLowerCase('es');const letter=cat.slice(0,1).toUpperCase();
      return `<button type="button" class="edit-card reveal" data-edit-cat="${esc(cat)}" style="--edit-gradient:${gradients[i]}"><span class="edit-number">DAYAMS / 0${i+1}</span>${image?`<img src="${esc(imageURL(image.image))}" alt="" loading="lazy" decoding="async">`:`<span class="edit-art" aria-hidden="true">${esc(letter)}<span>✳</span></span>`}<span class="edit-content"><span><small>Explora ${items.length} ${items.length===1?'prenda':'prendas'}</small><b>${esc(cat)}</b></span><i aria-hidden="true">↗</i></span></button>`
    }).join('');grid.parentElement.parentElement.classList.toggle('hidden',!picks.length);setupReveals();
  }
  function renderColorDiscover(){
    const holder=$('colorDiscover');if(!holder)return;
    const list=new Map();for(const product of state.catalog.products.filter(isActive))for(const name of product.colors){const key=name.toLocaleLowerCase('es');if(!list.has(key))list.set(key,{name,hex:colorChip(name,product)})}
    holder.innerHTML=[...list.values()].slice(0,12).map(c=>`<button type="button" class="color-token" style="--swatch:${esc(c.hex)}" data-pick-color="${esc(c.name)}" title="Ver prendas de color ${esc(c.name)}" aria-label="Ver prendas de color ${esc(c.name)}"><span>${esc(c.name)}</span></button>`).join('');
    const wrapper=holder.closest('.color-section');if(wrapper)wrapper.classList.toggle('hidden',list.size===0)
  }
  function revealCategory(category){state.colorFilter='';state.category=category;state.onlyFavorites=false;state.search='';$('productSearch').value='';renderFilters();renderProducts();updateBadges();$('coleccion').scrollIntoView({behavior:reducedMotion?'instant':'smooth'})}
  function revealColor(color){state.category='Todas';state.onlyFavorites=false;state.search='';state.colorFilter=color;$('productSearch').value='';renderFilters();renderProducts();updateBadges();$('colorFeedback').textContent=`Mostrando looks en ${color}. ¡Encuentra tu favorito!`;$('coleccion').scrollIntoView({behavior:reducedMotion?'instant':'smooth'})}

  function openProduct(id){
    const p=productById(id);if(!p||!isActive(p))return;
    const images=[p.image,...p.gallery].map(imageURL).filter(Boolean);
    state.detail={id,size:p.sizes[0],color:p.colors[0],qty:1,imageIndex:0,images};
    dialog(`<div class="dialog-top"><span class="detail-label">DAYAMS · DETALLES</span><button class="close" type="button" data-close aria-label="Cerrar detalle">×</button></div><div class="detail-grid"><div><div class="detail-photo" id="detailPhoto">${picMarkup(images[0]||'',p.name,'detail-main-photo',true)}${images.length?'<span class="zoom-hint">✳ Foto de la prenda</span>':''}</div><div class="gallery-thumbs" id="galleryThumbs">${images.map((src,i)=>`<button type="button" class="gallery-thumb ${i===0?'active':''}" data-gallery="${i}" aria-label="Ver fotografía ${i+1}"><img src="${esc(src)}" alt="Fotografía ${i+1} de ${esc(p.name)}" loading="lazy"></button>`).join('')}</div></div><div class="detail-content"><span class="detail-label">${esc(p.category||'Nuestra colección')}</span><h2>${esc(p.name)}</h2><div class="detail-price">${money(p.price)}</div>${p.wholesale>0&&p.wholesale<p.price&&settings().wholesale_enabled!==false?`<span class="detail-wholesale">Precio por mayor: <b>${money(p.wholesale)} c/u</b> desde ${wholesaleMin()} prendas en tu bolsa.</span>`:''}<p class="detail-description">${esc(p.description||'Una pieza especial para ti. Consulta los detalles por WhatsApp.')}</p>${p.material?`<p class="detail-note"><b>Material:</b> ${esc(p.material)}</p>`:''}${p.care?`<p class="detail-note"><b>Cuidado:</b> ${esc(p.care)}</p>`:''}<div class="option-group"><div class="option-heading"><span>Elige tu talla</span><button type="button" id="sizeGuide" class="size-guide-button">¿Cómo elijo mi talla?</button></div><div class="options" id="sizeOptions">${p.sizes.map((size,i)=>`<button type="button" data-size="${esc(size)}" aria-pressed="${i===0}" class="option-btn ${i===0?'selected':''}">${esc(size)}</button>`).join('')}</div></div><div class="option-group"><div class="option-heading"><span>Elige tu color</span><span>${p.colors.length} tonos</span></div><div class="options" id="colorOptions">${p.colors.map((c,i)=>`<button type="button" data-color="${esc(c)}" aria-pressed="${i===0}" class="option-btn color-option ${i===0?'selected':''}"><span class="color-swatch" style="background:${colorChip(c,p)}"></span>${esc(c)}</button>`).join('')}</div><span class="detail-color-help">Las tonalidades son orientativas; pueden variar según la iluminación y la pantalla.</span></div><div class="option-heading"><span>Cantidad</span><span>${p.stock?'Disponibilidad referencial: '+p.stock:'Agotado'}</span></div><div class="detail-controls"><div class="qty-picker"><button id="detailMinus" aria-label="Disminuir cantidad" type="button"><span aria-hidden="true">−</span></button><span id="detailQty">1</span><button id="detailPlus" aria-label="Aumentar cantidad" type="button"><span aria-hidden="true">+</span></button></div><button type="button" id="detailAdd" class="btn btn-rose detail-add" ${p.stock===0?'disabled':''}>${p.stock===0?'Agotado':'Agregar a mi bolsa'} ${icon('bag')}</button></div><p class="detail-note">Las existencias son totales entre todas las tallas y colores. Confirmamos tu elección por WhatsApp antes del pago.</p><div class="detail-actions"><button id="detailShare" type="button">${icon('share')} Compartir prenda</button><button id="detailFav" type="button" class="${state.favorites.has(id)?'on':''}">${icon('heart')} ${state.favorites.has(id)?'Guardado':'Guardar favorito'}</button></div></div></div>`);
    updateDetailQty();
  }
  function updateDetailQty(){if(!state.detail)return;const p=productById(state.detail.id),max=Math.max(0,productStock(p)-used(p.id));const d=state.detail;
    d.qty=Math.min(d.qty,Math.max(1,max));if($('detailQty'))$('detailQty').textContent=d.qty;
    if($('detailMinus'))$('detailMinus').disabled=d.qty<=1;if($('detailPlus'))$('detailPlus').disabled=max<=d.qty;if($('detailAdd'))$('detailAdd').disabled=max<1;
  }
  function addToCart(){const d=state.detail;if(!d)return;const p=productById(d.id);if(!p||!isActive(p))return;
    if(used(p.id)+d.qty>p.stock){notice('La cantidad supera el stock total. Actualiza tu selección.');updateDetailQty();return}
    const existing=state.cart.find(x=>x.id===d.id&&x.size===d.size&&x.color===d.color);
    if(existing)existing.qty+=d.qty;else state.cart.push({id:d.id,size:d.size,color:d.color,qty:d.qty});
    saveCart();closeDialog();notice('¡Tu prenda ya está en la bolsa! ♡');
  }
  function toggleFavorite(id){if(state.favorites.has(id))state.favorites.delete(id);else state.favorites.add(id);saveFavorites();renderProducts();if(state.dialog==='detail'&&state.detail?.id===id){const b=$('detailFav');if(b){b.classList.toggle('on',state.favorites.has(id));b.innerHTML=`${icon('heart')} ${state.favorites.has(id)?'Guardado':'Guardar favorito'}`}}}
  async function copyText(value,message='Enlace copiado ✓'){
    try{await navigator.clipboard.writeText(value);notice(message)}catch{
      const el=document.createElement('textarea');el.value=value;document.body.appendChild(el);el.select();const ok=document.execCommand('copy');el.remove();notice(ok?message:'No se pudo copiar. Usa Compartir desde tu navegador.')
    }
  }
  async function shareProduct(id){const p=productById(id);if(!p)return;const url=new URL(location.href);url.searchParams.set('producto',id);url.hash='';
    if(navigator.share){try{await navigator.share({title:`${p.name} · DAYAMS`,text:'Mira esta prenda en DAYAMS Boutique ♡',url:url.href});return}catch(e){if(e.name==='AbortError')return}}
    await copyText(url.href);
  }
  function cartItemHTML(item,i){const p=productById(item.id);if(!p)return '';
    const path=imageURL(p.image);const thumb=path?`<img class="cart-thumb" src="${esc(path)}" alt="${esc(p.name)}" loading="lazy">`:'<div class="cart-thumb cart-placeholder">✳</div>';
    return `<div class="cart-item">${thumb}<div class="cart-item-main"><strong>${esc(p.name)}</strong><small>Talla ${esc(item.size)} · ${esc(item.color)}<br>${money(priceFor(p))} c/u</small><button type="button" data-remove="${i}" class="remove-line">Eliminar</button></div><div class="cart-qty"><button type="button" data-decrease="${i}" aria-label="Quitar una unidad de ${esc(p.name)}"><span aria-hidden="true">−</span></button><b>${item.qty}</b><button type="button" data-increase="${i}" ${used(item.id)>=p.stock?'disabled':''} aria-label="Agregar una unidad de ${esc(p.name)}"><span aria-hidden="true">+</span></button></div></div>`;
  }
  function openCart(){
    dialog(`<div class="dialog-top"><h2>Mi bolsa <span style="color:var(--rose)">♡</span></h2><button type="button" class="close" data-close aria-label="Cerrar bolsa">×</button></div><div class="cart-body"><div class="cart-lines" id="cartLines"></div><div class="cart-summary"><strong>Total de prendas</strong><b id="cartTotal">S/ 0.00</b></div><p id="discountNote" class="discount-note"></p><div id="checkoutBlock"><h3 class="checkout-title">¡Ya casi es tuyo!</h3><p class="checkout-sub">Completa estos datos para preparar el mensaje de pedido. No se envían hasta que abras WhatsApp.</p><form id="orderForm" novalidate><div class="fieldgroup"><label for="buyerName">Tu nombre *</label><input class="field" name="name" id="buyerName" autocomplete="name" maxlength="80" required placeholder="¿Cómo te llamas?"></div><div class="fieldgroup"><label for="buyerCity">Ciudad / distrito *</label><input class="field" name="city" id="buyerCity" maxlength="100" required placeholder="Ej. Lima, Surco"></div><div class="fieldgroup"><label for="buyerDelivery">¿Cómo prefieres recibirlo?</label><select class="field" id="buyerDelivery"><option value="Por coordinar">Lo coordinamos por WhatsApp</option><option value="Delivery">Delivery</option><option value="Envío por agencia">Envío por agencia</option><option value="Recojo (consultar disponibilidad)">Recojo, si está disponible</option></select></div><div class="fieldgroup"><label for="buyerNotes">Comentario (opcional)</label><textarea id="buyerNotes" class="field" maxlength="350" rows="2" placeholder="Una indicación sobre tu pedido"></textarea></div><div class="checkout-info">${icon('check')} <b>Pago exclusivo por Yape.</b> Primero confirmaremos stock, envío y total final por WhatsApp. No envíes dinero antes de recibir esa confirmación.</div><div class="checkout-actions"><button id="checkoutWA" class="btn btn-rose btn-wide" type="submit">Preparar pedido por WhatsApp ${icon('whatsapp')}</button><button id="copyOrder" class="btn copy-order btn-wide" type="button">Copiar resumen del pedido ${icon('copy')}</button></div><p class="cart-privacy">No solicitamos número de tarjeta ni datos bancarios. El carrito se guarda solo en este dispositivo. Este paso no constituye una reserva ni confirma una venta.</p></form></div></div>`,'cart');renderCart();
  }
  function renderCart(){if(state.dialog!=='cart')return;const lines=$('cartLines');lines.innerHTML=state.cart.length?state.cart.map(cartItemHTML).join(''):`<div class="cart-empty"><span>♡</span><h3>Tu bolsa te espera</h3><p>Explora la colección y guarda tu próximo favorito.</p><button type="button" class="btn btn-outline" data-close>Explorar colección ${icon('arrow')}</button></div>`;
    $('cartTotal').textContent=money(subtotal());
    const savings=baseTotal()-subtotal(),missing=wholesaleMin()-totalQty();
    $('discountNote').textContent=eligible()?(savings>0?`✳ Precio por mayor aplicado. Ahorras ${money(savings)} en prendas.`:'✳ Ya se activó el precio por mayor en las prendas configuradas para ello.'):(settings().wholesale_enabled===false?'Envío no incluido. Lo coordinaremos por WhatsApp.':`Agrega ${Math.max(0,missing)} ${missing===1?'prenda':'prendas'} más para activar el precio por mayor en los artículos que lo tengan configurado.`);
    $('checkoutBlock').classList.toggle('hidden',!state.cart.length);
  }
  function adjustCart(i,delta){const item=state.cart[i];if(!item)return;const p=productById(item.id);if(!p)return;
    if(delta>0&&used(item.id)>=p.stock){notice('No hay más unidades disponibles');return}
    item.qty+=delta;if(item.qty<=0)state.cart.splice(i,1);saveCart();renderCart();
  }
  function orderText(name,city,delivery,notes){
    const lines=state.cart.map(item=>{const p=productById(item.id);return `• ${p.name} | Talla ${item.size} | ${item.color} | ${item.qty} × ${money(priceFor(p))} = ${money(priceFor(p)*item.qty)}`});
    const total=money(subtotal());
    return `Hola, DAYAMS 💖 Quiero consultar este pedido:\n\n${lines.join('\n')}\n\nPrendas: ${total}${eligible()?' (precio por mayor, donde aplique)':''}\nNombre: ${name}\nCiudad/distrito: ${city}\nEntrega preferida: ${delivery}${notes?'\nComentario: '+notes:''}\n\nPor favor, confirmen disponibilidad, costo de envío y total final. Deseo pagar exclusivamente por Yape cuando me envíen el número o QR. ¡Gracias!`;
  }
  function orderValues(){return {name:String($('buyerName')?.value||'').trim(),city:String($('buyerCity')?.value||'').trim(),delivery:String($('buyerDelivery')?.value||'Por coordinar'),notes:String($('buyerNotes')?.value||'').trim()}}
  function validateOrder(){const v=orderValues();if(!v.name){notice('Escribe tu nombre');$('buyerName').focus();return null}if(!v.city){notice('Escribe tu ciudad o distrito');$('buyerCity').focus();return null}return v}
  function submitOrder(event){event.preventDefault();if(!state.cart.length)return;const v=validateOrder();if(!v)return;
    const wa=phone(settings().whatsapp);if(wa.length<10||wa.length>15){notice('El número de WhatsApp no está configurado correctamente.');return}
    const text=orderText(v.name,v.city,v.delivery,v.notes);
    // Mismo gesto del clic: evita bloqueadores de ventanas emergentes y abre la app cuando exista.
    window.location.assign(`https://wa.me/${wa}?text=${encodeURIComponent(text)}`);
  }
  function gallerySwitch(index){const d=state.detail;if(!d)return;const src=d.images[index];if(!src)return;d.imageIndex=index;
    $('detailPhoto').innerHTML=`${picMarkup(src,productById(d.id).name,'detail-main-photo',true)}<span class="zoom-hint">✳ Foto de la prenda</span>`;
    $('galleryThumbs').querySelectorAll('button').forEach((b,i)=>b.classList.toggle('active',i===index));
  }
  function registerEvents(){
    for(const id of ['cartButton','floatingCart'])$(id).addEventListener('click',openCart);
    $('menuButton').addEventListener('click',()=>{const open=$('mobileNav').classList.toggle('hidden')===false;$('menuButton').setAttribute('aria-expanded',String(open))});
    $('mobileNav').addEventListener('click',e=>{if(e.target.closest('a')){$('mobileNav').classList.add('hidden');$('menuButton').setAttribute('aria-expanded','false')}});
    $('searchButton').addEventListener('click',()=>{document.querySelector('#coleccion').scrollIntoView({behavior:reducedMotion?'instant':'smooth'});$('productSearch').focus({preventScroll:true})});
    $('favoritesButton').addEventListener('click',()=>{state.onlyFavorites=!state.onlyFavorites;state.colorFilter='';state.category='Todas';renderFilters();renderProducts();updateBadges();document.querySelector('#coleccion').scrollIntoView({behavior:reducedMotion?'instant':'smooth'})});
    $('productSearch').addEventListener('input',e=>{state.search=e.target.value;state.colorFilter='';renderProducts()});
    $('productSort').addEventListener('change',e=>{state.sort=e.target.value;renderProducts()});
    $('categoryFilters').addEventListener('click',e=>{const b=e.target.closest('[data-category]');if(!b)return;state.category=b.dataset.category;state.colorFilter='';renderFilters();renderProducts()});
    $('productsGrid').addEventListener('click',e=>{
      const fav=e.target.closest('[data-favorite]');if(fav){toggleFavorite(fav.dataset.favorite);return}
      const view=e.target.closest('[data-view]');if(view){openProduct(view.dataset.view);return}
      if(e.target.closest('[data-clear]')){state.category='Todas';state.colorFilter='';state.search='';state.onlyFavorites=false;state.sort='featured';$('productSearch').value='';$('productSort').value='featured';updateBadges();renderFilters();renderProducts()}
    });
    $('refreshProducts').addEventListener('click',()=>loadCatalog(true));
    $('editGrid').addEventListener('click',e=>{const b=e.target.closest('[data-edit-cat]');if(b)revealCategory(b.dataset.editCat)});
    $('colorDiscover').addEventListener('click',e=>{const b=e.target.closest('[data-pick-color]');if(b)revealColor(b.dataset.pickColor)});
    $('modalRoot').addEventListener('click',async e=>{
      if(e.target.id==='overlay'||e.target.closest('[data-close]')){closeDialog();return}
      const size=e.target.closest('[data-size]');if(size&&state.detail){state.detail.size=size.dataset.size;document.querySelectorAll('[data-size]').forEach(b=>{b.classList.toggle('selected',b===size);b.setAttribute('aria-pressed',String(b===size))});return}
      const color=e.target.closest('[data-color]');if(color&&state.detail){state.detail.color=color.dataset.color;document.querySelectorAll('[data-color]').forEach(b=>{b.classList.toggle('selected',b===color);b.setAttribute('aria-pressed',String(b===color))});return}
      const thumb=e.target.closest('[data-gallery]');if(thumb){gallerySwitch(Number(thumb.dataset.gallery));return}
      if(e.target.closest('#detailMinus')&&state.detail){state.detail.qty=Math.max(1,state.detail.qty-1);updateDetailQty();return}
      if(e.target.closest('#detailPlus')&&state.detail){state.detail.qty+=1;updateDetailQty();return}
      if(e.target.closest('#detailAdd')){addToCart();return}
      if(e.target.closest('#detailFav')&&state.detail){toggleFavorite(state.detail.id);return}
      if(e.target.closest('#sizeGuide')&&state.detail){const productId=state.detail.id;dialog(`<div class="dialog-top"><span class="detail-label">DAYAMS · TALLAS</span><button class="close" type="button" data-close aria-label="Cerrar guía">×</button></div><div class="size-guide-content"><span class="kicker">♡ TE AYUDAMOS</span><h2>Encuentra tu talla ideal.</h2><p>Para elegir con confianza, toma tus medidas y compáralas con las indicaciones de la prenda.</p><ol><li><b>Busto:</b> mide alrededor de la parte más amplia del pecho.</li><li><b>Cintura:</b> mide el contorno de la parte más estrecha.</li><li><b>Cadera:</b> mide la parte más amplia de tus caderas.</li></ol><p>Las tallas cambian según el modelo y la tela. No usamos una tabla universal para evitar recomendarte una talla equivocada.</p><button id="guideBack" type="button" class="btn btn-rose">Volver a la prenda ${icon('arrow')}</button></div>`,'guide');state.guideProduct=productId;return}
      if(e.target.closest('#guideBack')&&state.guideProduct){openProduct(state.guideProduct);return}
      if(e.target.closest('#detailShare')&&state.detail){await shareProduct(state.detail.id);return}
      const rem=e.target.closest('[data-remove]');if(rem){state.cart.splice(Number(rem.dataset.remove),1);saveCart();renderCart();return}
      const plus=e.target.closest('[data-increase]');if(plus){adjustCart(Number(plus.dataset.increase),1);return}
      const minus=e.target.closest('[data-decrease]');if(minus){adjustCart(Number(minus.dataset.decrease),-1);return}
      if(e.target.closest('#copyOrder')){if(!state.cart.length)return;const v=validateOrder();if(v){await copyText(orderText(v.name,v.city,v.delivery,v.notes),'Pedido copiado ✓');}return}
    });
    $('modalRoot').addEventListener('submit',e=>{if(e.target.id==='orderForm')submitOrder(e)});
    document.addEventListener('error',e=>{if(!(e.target instanceof HTMLImageElement))return;const img=e.target;img.style.display='none';if(img.nextElementSibling?.classList.contains('photo-fallback'))img.nextElementSibling.hidden=false;},{capture:true});
    document.addEventListener('keydown',e=>{
      if(e.key==='Escape'&&state.dialog){closeDialog();return}
      if(e.key!=='Tab'||!state.dialog)return;
      const box=$('modalRoot').querySelector('.dialog');if(!box)return;
      const focusables=[...box.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])')].filter(el=>el.getClientRects().length&&!el.closest('.hidden'));
      if(!focusables.length)return;const first=focusables[0],last=focusables.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
    });
    document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!state.dialog&&Date.now()-state.lastLoaded>90000)loadCatalog()});
    if(!reducedMotion&&window.matchMedia('(pointer:fine)').matches){
      const stage=$('heroScene'),inner=$('heroStage');stage.addEventListener('pointermove',e=>{const r=stage.getBoundingClientRect();const x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;inner.style.setProperty('--hero-ry',`${(x*10).toFixed(1)}deg`);inner.style.setProperty('--hero-rx',`${(-y*7).toFixed(1)}deg`)});
      stage.addEventListener('pointerleave',()=>{inner.style.setProperty('--hero-ry','0deg');inner.style.setProperty('--hero-rx','0deg')});
      $('productsGrid').addEventListener('pointermove',e=>{const card=e.target.closest('.product-card');if(!card)return;const r=card.getBoundingClientRect();card.style.setProperty('--tilt-x',`${((e.clientY-r.top)/r.height-.5)*-3}deg`);card.style.setProperty('--tilt-y',`${((e.clientX-r.left)/r.width-.5)*4}deg`)});
      $('productsGrid').addEventListener('pointerout',e=>{const card=e.target.closest('.product-card');if(card&&!card.contains(e.relatedTarget)){card.style.removeProperty('--tilt-x');card.style.removeProperty('--tilt-y')}});
    }
  }
  function setupIntro(){
    const el=$('introExperience'),skip=$('introSkip');if(!el)return;
    let dismissed=false,timer;
    const hide=()=>{if(dismissed)return;dismissed=true;clearTimeout(timer);el.classList.add('is-leaving');window.setTimeout(()=>{el.classList.add('is-done');el.setAttribute('aria-hidden','true')},950)};
    skip.addEventListener('click',hide);$('replayIntro')?.addEventListener('click',()=>{if(reducedMotion){notice('Tienes activada la preferencia de movimiento reducido.');return}dismissed=false;clearTimeout(timer);el.classList.remove('is-done','is-leaving');el.setAttribute('aria-hidden','false');timer=window.setTimeout(hide,2700)});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!dismissed)hide()});
    let seen=false;try{seen=sessionStorage.getItem('dayams_intro_seen_v1')==='1';sessionStorage.setItem('dayams_intro_seen_v1','1')}catch{}
    if(reducedMotion||seen||window.location.hash||new URL(location.href).searchParams.has('producto')){el.classList.add('is-done');return}
    el.setAttribute('aria-hidden','false');timer=window.setTimeout(hide,2700);
  }
  function setupScrollProgress(){let pending=false;const update=()=>{const d=document.documentElement;const max=Math.max(1,d.scrollHeight-innerHeight);d.style.setProperty('--scroll-progress',`${Math.min(100,Math.max(0,scrollY/max*100))}%`);pending=false};addEventListener('scroll',()=>{if(!pending){pending=true;requestAnimationFrame(update)}},{passive:true});update()}
  function start(){setupIntro();setupScrollProgress();defaultHeroPicture=$('heroPicture').innerHTML;readStorage();updateBadges();$('year').textContent=new Date().getFullYear();registerEvents();setupReveals();loadCatalog()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
  // API de diagnóstico local, sin secretos ni permiso de escritura sobre GitHub.
  window.__DAYAMS_DEBUG__={get catalog(){return state.catalog},get cart(){return state.cart},get favorites(){return [...state.favorites]},get subtotal(){return subtotal()},get totalUnits(){return totalQty()},get eligible(){return eligible()},productById,imageURL,orderText,openProduct,openCart,loadCatalog};
})();
