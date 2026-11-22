export class Sim{
constructor(water){this.water=water;this.running=true;this.speed=1;this.acc=0;this.time=0}
update(dt){if(!this.running)return;this.time+=dt*this.speed;
this.acc+=Math.min(dt,.05)*30*this.speed*this.water.flow;const n=Math.min(Math.floor(this.acc),24);this.acc-=Math.floor(this.acc);
for(let k=0;k<n;k++)this.water.step()}}
