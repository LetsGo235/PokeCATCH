window.GMRPG = window.GMRPG || {};
// js/systems/types.js
const typeMult = (atkType, defType) => {
  if (atkType==="Neutral") return 1.0;
  if (atkType==="Fire"  && defType==="Leaf")  return 1.6;
  if (atkType==="Leaf"  && defType==="Water") return 1.6;
  if (atkType==="Water" && defType==="Fire")  return 1.6;
  if (atkType==="Fire"  && defType==="Water") return 0.6;
  if (atkType==="Leaf"  && defType==="Fire")  return 0.6;
  if (atkType==="Water" && defType==="Leaf")  return 0.6;
  if (atkType==="Stone" && defType==="Air")   return 1.6;
  if (atkType==="Air"   && defType==="Stone") return 0.6;
  if (atkType==="Air"   && defType==="Leaf")  return 1.2;
  if (atkType==="Leaf"  && defType==="Air")   return 0.8;
  if (atkType==="Night" && defType==="Air")   return 1.4;
  if (atkType==="Night" && defType==="Leaf")  return 1.2;
  if (atkType==="Night" && defType==="Fire")  return 0.9;
  return 1.0;
};

function typeColor(type){
  const colors={ Leaf:"#4cff9b", Fire:"#ff6b6b", Water:"#4dd3ff", Stone:"#caa86c", Air:"#d9e7ff", Night:"#b08cff", Neutral:"#cfd6e6" };
  return colors[type]||"#ffffff";
}

window.GMRPG.typeMult = typeMult;
window.GMRPG.typeColor = typeColor;
