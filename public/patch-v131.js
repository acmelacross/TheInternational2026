(function(){
  function setText(el, value){
    if (el && el.textContent !== value) el.textContent = value;
  }
  function apply(){
    setText(document.querySelector('#chinaSection .kicker'), '中国队');

    document.querySelectorAll('.cn-badge').forEach(el => setText(el, 'cn'));
    document.querySelectorAll('.cn-corner').forEach(el => setText(el, '中国队'));

    document.querySelectorAll('.team-card-copy small').forEach(el => {
      if ((el.textContent || '').includes('CN FOCUS')) setText(el, '中国战队');
    });

    setText(document.querySelector('#chinaProfilesSection h2'), '中国战队资料');
    setText(document.querySelector('#chinaProfilesSection .muted.small'), '等待更新');

    const box = document.getElementById('chinaProfiles');
    const waiting = '<div class="empty waiting-panel">中国战队资料等待更新</div>';
    if (box && box.innerHTML !== waiting) box.innerHTML = waiting;
  }

  window.addEventListener('load', () => {
    apply();
    const target = document.body;
    if (target) new MutationObserver(apply).observe(target, { childList:true, subtree:true });
    setTimeout(apply, 300);
    setTimeout(apply, 1200);
  });
})();
