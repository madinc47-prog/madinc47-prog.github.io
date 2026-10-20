(function(){var f=document.querySelector("form"),n=document.getElementById("artist"),s=document.getElementById("subj");
f.addEventListener("submit",function(){var k=f.dataset.kind==="ad"?"Island Beats Radio ad request: ":"Island Beats Radio application: ";s.value=k+(n.value||"").slice(0,80);});})();
