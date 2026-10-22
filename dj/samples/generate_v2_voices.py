import os, subprocess, sys, numpy as np, soundfile as sf
from kokoro_onnx import Kokoro
K="/workspace/kokoro"; k=Kokoro(K+"/kokoro-v1.0.onnx",K+"/voices-v1.0.bin")
V=sys.argv[1] if len(sys.argv)>1 else "bf_emma"
LINES={"a01-dj-psycho-fingers-gran":"D J Psycho Fingers!","a02-on-the-decks-gran":"Psycho Fingers, on the decks!",
"a03-yeah":"Yeah!","a04-hey":"Hey!","a05-come-on":"Come on!","a06-make-some-noise":"Make some noise!",
"a07-rewind-gran":"Rewind!","a08-run-it-back-gran":"Run it back!","a09-big-tune-gran":"Big tune!",
"a10-lets-go":"Let's go!","a11-hands-up":"Put your hands up!","a12-one-more-time":"One more time!",
"a13-turn-it-up":"Turn it up!","a14-oh-yeah":"Oh yeah!","a15-in-the-mix-gran":"Psycho Fingers, in the mix!",
"a16-laugh":"Ha ha ha ha ha!","c07-fresh-stab-gran":"Fresh!","c08-yeah-stab-gran":"Yeah!","c09-hey-stab-gran":"Hey!","c13-rewind-swell-gran":"Rewind!"}
os.makedirs("raw",exist_ok=True); os.makedirs("out",exist_ok=True)
AGE="rubberband=pitch=0.9:tempo=0.9:formant=preserved,vibrato=f=5.5:d=0.18,tremolo=f=6.5:d=0.12,highpass=f=170,lowpass=f=7500,equalizer=f=1800:t=q:w=1:g=3,equalizer=f=300:t=q:w=1:g=-3,acompressor=threshold=-20dB:ratio=3:attack=5:release=80:makeup=3,aecho=0.8:0.4:70:0.2"
for n,t in LINES.items():
    if len(sys.argv)>2 and n not in sys.argv[2:]: continue
    a,sr=k.create(t,voice=V,speed=0.95,lang="en-gb" if V.startswith("b") else "en-us")
    raw=f"raw/{n}.wav"; sf.write(raw,a,sr)
    if "swell" in n: af=AGE+",apad=pad_dur=1.5,aecho=0.8:0.7:120|240|360:0.5|0.35|0.2,areverse"
    else: af=AGE
    af+=",silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,afade=t=in:d=0.004,areverse,afade=t=in:d=0.04,areverse"
    subprocess.run(["ffmpeg","-v","error","-y","-i",raw,"-af",af,"-ar","44100","-ac","1",f"out/{n}.wav"],check=True)
    x,s=sf.read(f"out/{n}.wav"); x=x/np.abs(x).max()*10**(-1/20); sf.write(f"out/{n}.wav",x,s)
print("ok")
