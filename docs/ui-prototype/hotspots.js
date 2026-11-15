/* Red outlines on everything you can tap, with a switch in the prototype bar to hide them for clean screenshots. */
(function () {
  var KEY = 'bb-proto-hotspots';
  var on = true;
  try { on = localStorage.getItem(KEY) !== 'off'; } catch (e) { /* storage blocked: keep the default */ }

  function apply() { document.documentElement.classList.toggle('hotspots', on); }
  apply();

  var bar = document.querySelector('.proto-bar');
  if (!bar) return;
  var label = document.createElement('label');
  label.className = 'proto-ctl proto-hot';
  var box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = on;
  box.addEventListener('change', function () {
    on = box.checked;
    apply();
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) { /* ignore */ }
  });
  label.append(box, ' Show tap targets');
  bar.appendChild(label);
})();
