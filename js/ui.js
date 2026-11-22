export function initUI({sim,water,cam}){const $=s=>document.querySelector(s),all=s=>[...document.querySelectorAll(s)];
const st=()=>$('#st').textContent=sim.running?'يعمل ×'+sim.speed:'متوقف';
$('#pp').onclick=()=>{sim.running=!sim.running;$('#pp').textContent=sim.running?'⏸':'▶';st()};
all('.sp').forEach(b=>b.onclick=()=>{sim.speed=+b.dataset.s;all('.sp').forEach(x=>x.classList.toggle('on',x==b));st()});
$('#cam').onclick=()=>cam.reset();
$('#rw').onclick=()=>water.reset();
$('#wp').onclick=()=>$('#panel').classList.toggle('open');
$('#src').onclick=e=>{water.srcOn=!water.srcOn;e.target.classList.toggle('on',water.srcOn);e.target.textContent='المصدر: '+(water.srcOn?'يعمل':'متوقف')};
$('#flow').oninput=e=>water.flow=+e.target.value;
$('#rate').oninput=e=>water.rate=+e.target.value;
$('#rain').onclick=()=>water.rain()}
