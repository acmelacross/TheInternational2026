(function(){
  function setText(el, value){
    if (el && el.textContent !== value) el.textContent = value;
  }
  function apply(){
    document.querySelectorAll('.cn-badge').forEach(el => setText(el, 'cn'));
    document.querySelectorAll('.detail-cn-flag b').forEach(el => setText(el, '中国队'));
  }
  window.addEventListener('load', () => {
    apply();
    const target = document.body;
    if (target) new MutationObserver(apply).observe(target, { childList:true, subtree:true });
    setTimeout(apply, 300);
    setTimeout(apply, 1200);
  });
})();
