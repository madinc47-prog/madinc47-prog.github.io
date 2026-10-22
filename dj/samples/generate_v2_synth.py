import numpy as np, soundfile as sf
from scipy import signal
SR=44100; rng=np.random.default_rng(7)
def t(d): return np.arange(int(d*SR))/SR
def fin(x,n):
    x=x-np.mean(x); a=int(.002*SR); b=int(.03*SR); x[:a]*=np.linspace(0,1,a); x[-b:]*=np.linspace(1,0,b)
    sf.write(f"out/{n}.wav",x/np.abs(x).max()*10**(-1/20),SR)
# referee whistle: 2.8k tone + trill AM + breath
tt=t(0.9); f=2800+40*np.sin(2*np.pi*28*tt); ph=2*np.pi*np.cumsum(f)/SR
x=np.sin(ph)*(0.75+0.25*np.sin(2*np.pi*28*tt))+0.05*rng.uniform(-1,1,len(tt)); x*=np.minimum(1,tt/0.02)*np.minimum(1,(0.9-tt)/0.1); fin(x,"d07-whistle")
# bell
tt=t(2.5); x=sum(g*np.sin(2*np.pi*880*m*tt)*np.exp(-tt/d) for m,g,d in [(1,1,1.2),(2.76,.5,.6),(5.4,.3,.3),(8.93,.15,.15),(0.5,.3,1.8)]); fin(x*np.minimum(1,tt/0.002),"d08-bell")
# dubstep wobble hit
tt=t(1.6); f=55; ph=2*np.pi*f*tt; saw=sum(np.sin(k*ph)/k for k in range(1,40))+sum(np.sin(k*ph*1.01)/k for k in range(1,40))
lfo=(1-np.cos(2*np.pi*4*tt))/2; out=np.zeros_like(saw); zi=None
for i in range(0,len(saw),256):
    fc=150+2500*lfo[i]; b,a=signal.butter(2,fc/(SR/2)); seg,zi=signal.lfilter(b,a,saw[i:i+256],zi=zi if zi is not None else signal.lfilter_zi(b,a)*0); out[i:i+256]=seg
out=np.tanh(out*2)*np.minimum(1,(1.6-tt)/0.2); fin(out,"d09-dubstep-wobble")
# finger snap
tt=t(0.3); n=rng.uniform(-1,1,len(tt)); b,a=signal.butter(2,[1800/(SR/2),6000/(SR/2)],'band'); x=signal.lfilter(b,a,n)*np.exp(-tt/0.025)+0.4*np.sin(2*np.pi*1200*tt)*np.exp(-tt/0.01); fin(x,"d10-snap")
