/* 冒烟测试：真跑游戏循环，逐条验证本次 8 项平衡调整 */
import { DUT as D } from "./.smoke-boot.mjs";

let pass = 0, fail = 0;
const ok = (cond, msg, extra) => {
  if (cond) { pass++; console.log("  ✓ " + msg); }
  else { fail++; console.log("  ✗ " + msg + (extra !== undefined ? "  →  " + extra : "")); }
};
const sec = (t) => console.log("\n== " + t + " ==");

/* 推进 n 帧 */
let clock = 1000;
function run(n, dtms = 16.7) {
  for (let i = 0; i < n; i++) { clock += dtms; D.frame(clock); }
}
/* 把被动全部归零 —— 注意必须保留所有键，直接赋 {} 会让 stats() 乘出 NaN */
function clearPassives(p) { for (const k of Object.keys(D.PASSIVES)) p.passives[k] = 0; }

sec("0. 启动一局（武器大师）");
D.startGame("master");
const G = D.G, p = G.players[0];
run(5);
ok(G.state === "play", "进入 play 状态", G.state);
ok(D.weaponSlots(p) === 10, "武器大师开局 10 个武器槽", D.weaponSlots(p));
ok(p.weapons.length >= 1, "起手带了一件武器（左轮）", p.weapons.map(w => w.key).join(","));

sec("1. 武器大师：每多带一件武器 伤害 +4% / 攻速 -1%");
while (p.weapons.length < 6) D.giveWeapon(p, ["knife", "orbit", "aura", "fire", "frost"][p.weapons.length % 5] + (p.weapons.length > 5 ? "2" : ""));
// 确保真的有 6 件（去重后再补）
const keys = ["knife", "orbit", "aura", "fire", "frost", "bolt", "orb", "sentry", "shuriken", "chain"];
for (const k of keys) { if (p.weapons.length >= 6) break; if (!p.weapons.some(w => w.key === k)) D.giveWeapon(p, k); }
ok(p.weapons.length === 6, "成功带上 6 件武器", p.weapons.length);
const stMaster = D.stats(p);
const expDmg = (1 + 0.10 * (p.passives.dmg || 0)) * (1 + 0.04 * 5);
const expRate = (1 + 0.10 * (p.passives.rate || 0)) * (1 - 0.01 * 5);
ok(Math.abs(stMaster.dmgMul - expDmg) < 1e-9, "伤害倍率 = 基础 ×(1+0.04×5)", stMaster.dmgMul.toFixed(4) + " vs " + expDmg.toFixed(4));
ok(Math.abs(stMaster.rateMul - expRate) < 1e-9, "攻速倍率 = 基础 ×(1-0.01×5)", stMaster.rateMul.toFixed(4) + " vs " + expRate.toFixed(4));
ok(!("nocrit" in p.mods), "武器大师不再有永久无法暴击");
ok(stMaster.crit === 0.05 && stMaster.critDmg === 2, "暴击率/暴伤回到基础值（不再被 nocrit 清成 0/1）", stMaster.crit + " / " + stMaster.critDmg);
p.passives.crit = 5; p.passives.critDmg = 5;
const stCrit = D.stats(p);
// 注意：锐眼自己带"暴伤 -0.12/级"的代价、致命带"暴击 -0.03/级"，所以不是干净的 5×7%
ok(stCrit.crit > 0.25 && stCrit.crit < 0.35, "武器大师现在能正常吃暴击被动（5级 ≈26%，被致命代价压回一些）", stCrit.crit);
ok(stCrit.critDmg > 3.9, "暴伤被动也生效", stCrit.critDmg);
p.passives.crit = 10; p.passives.critDmg = 0;
ok(D.stats(p).crit > 0.7, "满级锐眼 10 级 = 70% 暴击（旧版 5 级只有 35%）", D.stats(p).crit);
clearPassives(p);
ok(p.mods.taken === undefined, "武器大师不再有额外受伤");

sec("2. 狂战士：取消受伤加成 debuff");
const zerk = D.HEROES.find(h => h.key === "berserk");
ok(zerk.mods.taken === undefined, "狂战士 mods 里没有 taken", JSON.stringify(zerk.mods));
ok(zerk.mods.dmg === 0.35 && zerk.mods.hp === -0.25, "只保留 伤害+35% / 生命-25%");

sec("3. 所有武器 debuff 已取消");
const carries = Object.keys(D.WEAPONS).filter(k => D.WEAPONS[k].carry || D.WEAPONS[k].down);
ok(carries.length === 0, "没有任何武器还挂着 carry / down", carries.join(","));

sec("4. 落雷加强 / 球状闪电加强");
const b1 = D.WEAPONS.bolt.stat(1), b8 = D.WEAPONS.bolt.stat(8);
const o1 = D.WEAPONS.orb.stat(1), o8 = D.WEAPONS.orb.stat(8);
// 旧值：bolt cd max(0.85, 3.4-l*0.24) dmg 14+l*7 ；orb cd max(1.7, 3.6-l*0.23) dmg 5+l*2.4 rate 0.4
const oldBolt = (l) => ({ cd: Math.max(0.85, 3.4 - l * 0.24), dmg: 14 + l * 7 });
const oldOrb = (l) => ({ cd: Math.max(1.7, 3.6 - l * 0.23), dmg: 5 + l * 2.4 });
ok(b1.dmg === 27 && b8.dmg === 90, "落雷伤害 18+9/级", b1.dmg + " → " + b8.dmg);
ok(b1.dmg > oldBolt(1).dmg && b8.dmg > oldBolt(8).dmg, "落雷伤害比改前高（Lv1 " + oldBolt(1).dmg + "→" + b1.dmg + "，Lv8 " + oldBolt(8).dmg + "→" + b8.dmg + "）");
ok(b1.cd < oldBolt(1).cd && b8.cd < oldBolt(8).cd, "落雷攻速比改前快（Lv1 " + oldBolt(1).cd.toFixed(2) + "→" + b1.cd.toFixed(2) + "s，Lv8 " + oldBolt(8).cd.toFixed(2) + "→" + b8.cd.toFixed(2) + "s）");
ok(b8.count === 1 + Math.floor(7 / 3), "落雷每 3 级多一道", b8.count);
ok(o1.dmg === 11.4 && o8.dmg === 35.2, "球电伤害 8+3.4/级", o1.dmg + " → " + o8.dmg);
ok(o1.dmg > oldOrb(1).dmg && o8.dmg > oldOrb(8).dmg, "球电伤害比改前高（Lv1 " + oldOrb(1).dmg + "→" + o1.dmg + "，Lv8 " + oldOrb(8).dmg + "→" + o8.dmg + "）");
ok(o8.count === 5, "球电每 2 级多一颗（Lv8 = 5 颗，改前 3 颗）", o8.count);
ok(o8.radius > D.WEAPONS.orb.stat(1).radius && o8.dur > o1.dur, "球电判定半径与持续时间上调");
ok(o1.rate < 0.4, "球电放电更频繁", o1.rate);

sec("5. 十字光束：常驻 + 真旋转 + 持续切割");
p.weapons.length = 0; clearPassives(p);
D.giveWeapon(p, "beam");
ok(p.weapons[0].key === "beam", "装上十字光束");
run(10);
ok(G.beams.length === 1, "Lv1 = 1 个十字（常驻存在）", G.beams.length);
const bAng0 = G.beams[0].a;
run(60);   // 1 秒
ok(G.beams.length === 1, "1 秒后十字依然存在（不再有 life 到点消失）", G.beams.length);
ok(Math.abs(G.beams[0].a - bAng0) > 0.1, "角度真的在变（旋转已实现）", (G.beams[0].a - bAng0).toFixed(3));
// 升级到 Lv4 → 4 个十字
p.weapons[0].level = 4;
run(5);
ok(G.beams.length === 4, "Lv4 = 4 个十字", G.beams.length);
ok(G.beams[0].len === D.WEAPONS.beam.stat(4).len, "长度跟着等级同步", G.beams[0].len);
// 持续切割：站在光束上的敌人应被反复命中
G.enemies.length = 0;
D.spawnEnemy("slime", p.x + 60, p.y - 6, 1, 1, 1);
const slime = G.enemies[0];
slime.hp = 100000;
const hpA = slime.hp;
run(180);  // 3 秒
ok(slime.hp < hpA, "站在光束上的敌人持续掉血（而不是只被打一下）", (hpA - slime.hp).toFixed(1) + " 点");
const cutCount = Math.round((hpA - slime.hp) / D.WEAPONS.beam.stat(4).dmg);
ok(cutCount >= 4, "3 秒内被切了 " + cutCount + " 次（远多于旧版的 1 次）");
// 卸下武器 → 十字应当消失
p.weapons.length = 0;
run(5);
ok(G.beams.length === 0, "卸下十字光束后十字被清理", G.beams.length);

/* 只改数值、保留全部键 —— 赋一个"部分对象"会让 stats() 里别的字段变 NaN
   （s.speed 为 undefined → 移速 NaN → 玩家坐标 NaN → 后面全都测不出来） */
function setPassives(p, obj) { clearPassives(p); for (const k in obj) p.passives[k] = obj[k]; }

sec("6. 反震 / 铁壁（新增护甲被动）");
ok(D.PASSIVES.bulwark && D.PASSIVES.reflect, "铁壁与反震都在被动表里");
ok(D.PASSIVES.bulwark.max === 10 && D.PASSIVES.reflect.max === 10, "两者上限都是 Lv10");
ok(!D.PASSIVES.bulwark.pen && !D.PASSIVES.reflect.pen, "两者都没有代价");
setPassives(p, { armor: 10, bulwark: 1, reflect: 10 });
let st = D.stats(p);
ok(Math.abs(st.armor - 0.64) < 1e-9, "坚韧10 + 铁壁1 = 64% 护甲（突破旧 65% 上限前的正常值）", st.armor);
ok(Math.abs(st.reflect - 0.64 * 80) < 1e-9, "反震反伤 = 当前护甲 64% ×80 = 51.2", st.reflect);
setPassives(p, { armor: 10, bulwark: 10, reflect: 10 });
st = D.stats(p);
ok(Math.abs(st.armor - 0.85) < 1e-9, "坚韧10 + 铁壁10 = 85%（旧上限 65% 已被铁壁顶开）", st.armor);
ok(Math.abs(st.reflect - 68) < 1e-9, "满配反震 = 护甲 85% ×80 = 68", st.reflect);
setPassives(p, { armor: 10 });
st = D.stats(p);
ok(Math.abs(st.armor - 0.6) < 1e-9, "没有铁壁时护甲上限仍是 65%（此处 60% 未触顶，且不 NaN）", st.armor);
setPassives(p, { armor: 10, reflect: 0 });
st = D.stats(p);
ok(st.reflect === 0, "没点反震就没有反伤");
// 反震真的会在受伤时反弹给贴身敌人（ST() 按帧缓存，改完被动必须先过一帧）
setPassives(p, { armor: 10, bulwark: 10, reflect: 10 });
G.enemies.length = 0;
D.spawnEnemy("slime", p.x + 20, p.y, 1, 1, 1);
const bump = G.enemies[0];
bump.hp = 100000;
run(2);                       // 让 rebuildGrid 把 slime 放进网格、curST 刷新
bump.x = p.x + 20; bump.y = p.y;   // 压住位置：别让它这两帧走到别处或把玩家撞散
p.inv = 0;
const hpBefore = p.hp, slimeBefore = bump.hp;
D.hurtPlayer(p, 10);
ok(p.hp < hpBefore, "hurtPlayer 真的扣了血（前置条件成立）", hpBefore + " → " + p.hp);
ok(bump.hp < slimeBefore, "受伤时反震把伤害弹给了贴身敌人", (slimeBefore - bump.hp).toFixed(1) + " 点（护甲 85% ×80 ×dmgMul）");
clearPassives(p);

sec("7. 8 条被动取消代价 + 上限统一 Lv10");
const freed = ["magnet", "pierce", "thorn", "speed", "rate", "hp", "shield", "lithe"];
const stillPen = freed.filter(k => D.PASSIVES[k].pen || D.PASSIVES[k].down);
ok(stillPen.length === 0, "磁石/穿透/荆棘/疾靴/疾风/体魄/护盾/灵巧 已无任何代价", stillPen.join(","));
const lvls = Object.keys(D.PASSIVES).map(k => k + ":" + D.PASSIVES[k].max).filter(s => !s.endsWith(":10"));
ok(lvls.length === 0, "所有被动上限都是 Lv10", lvls.join(","));
ok(Object.keys(D.PASSIVES).length === 20, "被动共 20 种", Object.keys(D.PASSIVES).length);
ok(D.PASSIVES.rage.desc().includes("90%"), "狂怒满级残血 +90%", D.PASSIVES.rage.desc());
ok(D.PASSIVES.shield.desc().includes("1.25"), "护盾冷却按 10 级折算", D.PASSIVES.shield.desc());

sec("8. 远程怪限流（骷髅弓手 / 狙击手）");
G.enemies.length = 0; G.time = 600;
const pool = D.currentPool(600);
ok(pool.filter(k => k === "archer").length <= 1, "池里弓手权重 ≤1", pool.filter(k => k === "archer").length);
ok(pool.filter(k => k === "sniper").length <= 2, "池里狙击手权重 ≤2", pool.filter(k => k === "sniper").length);
// 场上远程怪没超限时，应该能刷出来
let picked = {};
for (let i = 0; i < 400; i++) { const k = D.pickSpawn(pool, 600); picked[k] = (picked[k] || 0) + 1; }
ok((picked.archer || 0) + (picked.sniper || 0) > 0, "限额没满时仍会刷远程怪", JSON.stringify(picked));
ok((picked.archer || 0) + (picked.sniper || 0) < 400, "远程怪占比被压低");
// 把场上塞满远程怪 → 应当一只都刷不出来
G.enemies.length = 0;
for (let i = 0; i < 40; i++) D.spawnEnemy("archer", 0, 0, 1, 1, 1);
const before = G.enemies.filter(e => e.type === "archer" || e.type === "sniper").length;
let ranged = 0;
for (let i = 0; i < 400; i++) { const k = D.pickSpawn(pool, 600); if (k === "archer" || k === "sniper") ranged++; }
ok(ranged === 0, "场上远程怪 " + before + " 只已超限 → 400 次抽样没有一只远程怪", ranged);

sec("9. 蝙蝠削弱速度、保留机动性");
ok(D.ENEMIES.bat.spd === 52, "蝙蝠移速 66 → 52", D.ENEMIES.bat.spd);
ok(D.ENEMIES.bat.spd > D.ENEMIES.ghost.spd, "依旧比幽灵快（机动性保留）", D.ENEMIES.bat.spd + " vs " + D.ENEMIES.ghost.spd);

sec("10. 长跑压测：满配 + 3000 帧，不允许抛异常");
p.weapons.length = 0; clearPassives(p);
for (const k of Object.keys(D.WEAPONS)) D.giveWeapon(p, k);
for (const k of Object.keys(D.PASSIVES)) p.passives[k] = 10;
G.time = 900;
let frames = 0;
try {
  run(3000, 16.7); frames = 3000;
  ok(true, "3000 帧无异常（含被命中/反震/十字/刷怪）");
} catch (e) {
  ok(false, "第 " + frames + " 帧抛异常: " + e.message, e.stack.split("\n")[1]);
}
const stAll = D.stats(p);
const nan = Object.keys(stAll).filter(k => typeof stAll[k] === "number" && !isFinite(stAll[k]));
ok(nan.length === 0, "满配 stats() 没有 NaN / Infinity", nan.join(","));
ok(G.beams.length > 0, "压测结束时十字仍在（常驻）", G.beams.length);
ok(G.enemies.length < 400, "敌人数量没有失控", G.enemies.length);

sec("11. 机制说明与数据面板能正常渲染");
// buildHelp() 不返回值，它把 HTML 写进 #helpBody；buildData(p) 需要一个玩家参数
let help = "";
try { D.buildHelp(); help = globalThis.__DOC.getElementById("helpBody").innerHTML || ""; } catch (e) { console.log("  (buildHelp 抛异常: " + e.message + ")"); }
ok(help.length > 2000, "机制说明面板渲染成功（" + help.length + " 字符）");
try {
  const d = D.buildData(p);
  ok(typeof d === "string" && d.length > 500, "TAB 数据面板渲染成功（" + (d ? d.length : 0) + " 字符）");
} catch (e) { ok(false, "数据面板渲染抛异常: " + e.message, e.stack.split("\n")[1]); }
ok(!help.includes("每条被动都带代价"), "说明里不再声称「每条被动都带代价」");
ok(!help.includes("部分重型武器也带代价"), "说明里不再声称「部分重型武器也带代价」");
ok(help.includes("铁壁") && help.includes("反震"), "说明里写进了铁壁 / 反震");
ok(help.includes("10 个槽位") || help.includes("10 个武器槽"), "说明里写进了武器大师的 10 个槽位");
ok(!/武器槽上限 10（初始 2，每 2 级 \+1）/.test(help), "说明里不再有「每 2 级 +1」的旧武器大师描述");
ok(D.buildData(p).includes("反震"), "数据面板里有反震行");

sec("12. 升级三选一：新被动能被抽到、卡面能渲染、选了能生效");
D.reset(["master"]);
const p2 = G.players[0];
clearPassives(p2);
// 反复抽样，确认新加的被动真的进了升级池（作者在 newPlayer 上方专门警告过这个坑）
const offered = {};
for (let i = 0; i < 400; i++) for (const o of D.buildOptions(p2)) if (o.kind === "p") offered[o.key] = 1;
ok(offered.bulwark === 1, "铁壁能被抽到");
ok(offered.reflect === 1, "反震能被抽到");
ok(Object.keys(offered).length === Object.keys(D.PASSIVES).length,
   "20 条被动一条不落全都能被抽到", Object.keys(D.PASSIVES).filter(k => !offered[k]).join(","));
// 真的走一遍「升级弹卡 → 选一张」的完整渲染路径
let crash = null, picks = 0;
try {
  for (let i = 0; i < 40; i++) {
    G.level++;
    D.openLevelUp();
    const opts = G.options;
    if (!opts || !opts.length) break;
    D.chooseUpgrade(0);
    picks++;
  }
} catch (e) { crash = e; }
ok(!crash, "连开 40 次升级卡 + 选卡没有抛异常（" + picks + " 次）", crash && crash.message);
const p3 = G.players[0];
ok(p3.weapons.length + Object.keys(D.PASSIVES).filter(k => p3.passives[k] > 0).length > 3, "40 次选择确实堆出了成长",
   p3.weapons.length + " 件武器 / " + Object.keys(D.PASSIVES).filter(k => p3.passives[k] > 0).length + " 条被动");
// 卡面是 appendChild 出来的节点，不是 innerHTML，所以数 children
const cardBox = globalThis.__DOC.getElementById("cards");
const cardN = (cardBox.children || []).length;
const cardTxt = (cardBox.children || []).map(c => c.innerHTML || "").join("");
ok(cardN === 3, "升级卡面确实渲染出了 3 张卡", cardN);
ok(cardTxt.length > 200, "卡面有实际文案（" + cardTxt.length + " 字符）");
const stP3 = D.stats(p3);
const nan3 = Object.keys(stP3).filter(k => typeof stP3[k] === "number" && !isFinite(stP3[k]));
ok(nan3.length === 0, "成长 40 次后 stats() 依然没有 NaN", nan3.join(","));

sec("结果");
console.log("  通过 " + pass + " 项，失败 " + fail + " 项");
process.exit(fail ? 1 : 0);
