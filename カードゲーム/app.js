// ================================
// ゲーム設定
// ================================
const STARTING_HAND = 5;
const STARTING_LIFE = 3000;
const MAX_FRONT = 4;
const MAX_BACK = 4;

const ELEMENTS = ["炎", "水", "風", "地", "光", "闇"];

const ELEMENT_BEATS = {
  "炎": "風",
  "風": "地",
  "地": "水",
  "水": "炎",
  "光": "闇",
  "闇": "光"
};

const state = {
  players: [],
  currentPlayer: 0,
  turn: 1,
  phase: "main",
  selectedAttackerId: null,
  nextCardId: 1,
  log: [],
  busy: false,
  cardDefinitions: []
};

// ================================
// カードデータ読み込み
// ================================
async function loadCardData() {
  const response = await fetch("./characters.json");

  if (!response.ok) {
    throw new Error("characters.jsonを読み込めませんでした");
  }

  const data = await response.json();

  const characters = (data.characters || []).map(c => ({
    ...c,
    type: "character",
    attribute: c.attribute || "炎",
    race: c.race || "人間",
    level: Number(c.level || 1),
    pp: Number(c.pp ?? 100),
    gp: Number(c.gp ?? 100),
    shield: Number(c.level || 1)
  }));

  const items = (data.items || []).map(item => ({
    ...item,
    type: "item"
  }));

  state.cardDefinitions = [...characters, ...items];

  if (!state.cardDefinitions.length) {
    throw new Error("JSONにキャラクターかアイテムを登録してください");
  }
}

// ================================
// 山札作成
// ================================
function shuffle(cards) {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    [cards[i], cards[j]] = [cards[j], cards[i]];
  }

  return cards;
}

function makeDeck(owner) {
  return shuffle(
    state.cardDefinitions.map(def => ({
      ...structuredClone(def),
      id: state.nextCardId++,
      owner,
      canAttack: false,
      hasAttacked: false,

      // キャラクターの初期SPはレベルと同じ
      ...(def.type === "character"
        ? { shield: Number(def.level || 1) }
        : {})
    }))
  );
}

// ================================
// プレイヤー作成
// ================================
function createPlayer(name, owner) {
  return {
    name,
    owner,
    life: STARTING_LIFE,
    deck: makeDeck(owner),
    hand: [],
    front: [],
    back: [],
    turnsTaken: 0
  };
}

// ================================
// メッセージ・ログ
// ================================
function log(text) {
  state.log.unshift(text);
  state.log = state.log.slice(0, 30);
}

function message(text) {
  document.getElementById("game-message").textContent = text;
}

// ================================
// ドロー
// ================================
function drawCards(player, amount) {
  for (let i = 0; i < amount; i++) {
    if (!player.deck.length) {
      log(`${player.name}の山札がなくなりました。`);
      break;
    }

    player.hand.push(player.deck.pop());
  }
}

// ================================
// ゲーム開始
// ================================
function startGame() {
  state.nextCardId = 1;

  state.players = [
    createPlayer("自分", 0),
    createPlayer("相手", 1)
  ];

  state.currentPlayer = 0;
  state.turn = 1;
  state.phase = "main";
  state.selectedAttackerId = null;
  state.log = [];
  state.busy = false;

  state.players.forEach(player => {
    drawCards(player, STARTING_HAND);
  });

  log("ゲーム開始。お互いに5枚ドローしました。");
  log("1ターン目は配置のみ。2ターン目から攻撃できます。");

  message("手札のカードをタップして配置してください。");

  render();
}

// ================================
// キャラクター取得
// ================================
function allCharacters(player) {
  return [...player.front];
}

function findAttacker() {
  if (state.players.length !== 2) return null;

  return allCharacters(state.players[0]).find(
    card => card.id === state.selectedAttackerId
  );
}

// ================================
// カード表示
// ================================
function createCardElement(card, onClick) {
  const button = document.createElement("button");

  button.type = "button";

  button.className =
    `card ${card.type === "character" ? "character-card" : "item-card"}`;

  if (card.id === state.selectedAttackerId) {
    button.classList.add("selected-card");
  }

  const name = document.createElement("div");
  name.className = "card-name";
  name.textContent = card.name;

  const type = document.createElement("div");
  type.className = "card-type";

  type.textContent = card.type === "character"
    ? `Lv.${card.level} / ${card.attribute || "属性なし"}`
    : "アイテム";

  const stats = document.createElement("div");
  stats.className = "card-stats";

  if (card.type === "character") {
    stats.textContent =
      `種族 ${card.race || "未設定"}\n` +
      `PP ${card.pp} / GP ${card.gp}\n` +
      `SP ${card.shield ?? card.level}`;
  } else {
    stats.textContent = `効果値 ${card.power ?? "—"}`;
  }

  button.append(name, type, stats);
  button.addEventListener("click", onClick);

  return button;
}

// ================================
// カード置き場を描画
// ================================
function renderArea(id, cards, handler, targetable = false) {
  const area = document.getElementById(id);

  area.replaceChildren();

  area.classList.toggle(
    "attackable-area",
    targetable && cards.length > 0
  );

  for (const card of cards) {
    const element = createCardElement(
      card,
      () => handler(card)
    );

    if (targetable) {
      element.classList.add("attack-target");
    }

    area.appendChild(element);
  }
}

// ================================
// 画面更新
// ================================
function render() {
  if (state.players.length !== 2) return;

  const me = state.players[0];
  const enemy = state.players[1];

  document.getElementById("player-life").textContent = me.life;
  document.getElementById("enemy-life").textContent = enemy.life;

  document.getElementById("player-deck-count").textContent =
    me.deck.length;

  document.getElementById("enemy-deck-count").textContent =
    enemy.deck.length;

  document.getElementById("turn-info").textContent =
    state.phase === "gameover"
      ? "ゲーム終了"
      : `${state.currentPlayer === 0 ? "自分" : "相手"}のターン / ${state.turn}ターン目`;

  const attackerSelected = !!findAttacker();

  const canTargetFront =
    attackerSelected && enemy.front.length > 0;

  const canTargetBack =
    attackerSelected &&
    enemy.front.length === 0 &&
    enemy.back.length > 0;

  renderArea(
    "enemy-front-area",
    enemy.front,
    card => attackTarget(card, "character"),
    canTargetFront
  );

  renderArea(
    "enemy-back-area",
    enemy.back,
    card => attackTarget(card, "item"),
    canTargetBack
  );

  renderArea(
    "player-front-area",
    me.front,
    selectAttacker
  );

  renderArea(
    "player-back-area",
    me.back,
    () => {}
  );

  renderArea(
    "hand-area",
    me.hand,
    card => playCard(card.id)
  );

  document.getElementById("end-turn-button").disabled =
    state.currentPlayer !== 0 ||
    state.phase !== "main" ||
    state.busy;

  document.getElementById("cancel-attack-button").disabled =
    state.selectedAttackerId === null;

  document.getElementById("enemy-status-area").classList.toggle(
    "direct-attack-ready",
    !!findAttacker() &&
    enemy.front.length === 0 &&
    enemy.back.length === 0
  );

  const list = document.getElementById("battle-log");
  list.replaceChildren();

  state.log.forEach(entry => {
    const li = document.createElement("li");
    li.textContent = entry;
    list.appendChild(li);
  });
}

// ================================
// カード配置
// ================================
function playCard(id) {
  if (
    state.currentPlayer !== 0 ||
    state.phase !== "main" ||
    state.busy
  ) {
    return;
  }

  if (state.selectedAttackerId !== null) {
    message("先に攻撃選択をキャンセルしてください。");
    return;
  }

  const me = state.players[0];

  const index = me.hand.findIndex(card => card.id === id);

  if (index < 0) return;

  const card = me.hand[index];

  if (card.type === "character") {
    if (me.front.length >= MAX_FRONT) {
      message("前衛は4枚までです。");
      return;
    }

    card.canAttack = false;
    card.hasAttacked = false;

    // SPが未設定の場合はレベルを初期値にする
    if (card.shield === undefined) {
      card.shield = card.level;
    }

    me.front.push(card);
  } else {
    if (me.back.length >= MAX_BACK) {
      message("後衛（アイテム欄）は4枚までです。");
      return;
    }

    me.back.push(card);
  }

  me.hand.splice(index, 1);

  log(`自分は「${card.name}」を配置しました。`);

  message(
    `${card.name}を配置しました。配置したターンは攻撃できません。`
  );

  render();
}

// ================================
// 攻撃キャラクター選択
// ================================
function selectAttacker(card) {
  if (
    state.currentPlayer !== 0 ||
    state.phase !== "main" ||
    state.busy
  ) {
    return;
  }

  if (state.selectedAttackerId === card.id) {
    state.selectedAttackerId = null;

    message("攻撃選択を解除しました。");

    render();
    return;
  }

  if (
    state.turn === 1 ||
    !card.canAttack ||
    card.hasAttacked
  ) {
    message(
      "このキャラはまだ攻撃できません。配置した次の自分のターンから攻撃できます。"
    );

    return;
  }

  state.selectedAttackerId = card.id;

  const enemy = state.players[1];

  if (enemy.front.length) {
    message("相手の前衛に赤い枠が出ています。前衛を選んでください。");
  } else if (enemy.back.length) {
    message("相手の前衛がいないため、後衛のアイテムを選んでください。");
  } else {
    message("相手のライフ欄をタップするとダイレクト攻撃します。");
  }

  render();
}

// ================================
// 攻撃対象を選択
// ================================
function attackTarget(target, kind) {
  const attacker = findAttacker();

  if (!attacker) {
    message("先に自分の前衛キャラクターを選んでください。");
    return;
  }

  const enemy = state.players[1];

  // 前衛が残っている間は前衛しか攻撃できない
  if (enemy.front.length > 0) {
    if (
      kind !== "character" ||
      !enemy.front.some(card => card.id === target.id)
    ) {
      message("相手の前衛がいる間は、前衛しか攻撃できません。");
      return;
    }

    resolveCharacterBattle(attacker, target, enemy.front);
  } else if (enemy.back.length > 0) {
    // 前衛がいない場合はアイテムを攻撃できる
    if (
      kind !== "item" ||
      !enemy.back.some(card => card.id === target.id)
    ) {
      message("相手の後衛にあるアイテムを選んでください。");
      return;
    }

    enemy.back = enemy.back.filter(
      card => card.id !== target.id
    );

    attacker.hasAttacked = true;

    log(`${attacker.name}がアイテム「${target.name}」を破壊しました。`);

    message(`アイテム「${target.name}」を破壊しました！`);
  } else {
    message("攻撃対象がいません。相手のライフ欄をタップしてください。");
    return;
  }

  state.selectedAttackerId = null;

  checkGameOver();
  render();
}

// ================================
// 属性補正
// ================================
function elementMultiplier(attacker, target) {
  if (
    ELEMENT_BEATS[attacker.attribute] === target.attribute
  ) {
    return 1.5;
  }

  if (
    ELEMENT_BEATS[target.attribute] === attacker.attribute
  ) {
    return 0.5;
  }

  return 1;
}

// ================================
// キャラクター戦闘
// ================================
function resolveCharacterBattle(attacker, target, row) {
  const attackLevel = Number(attacker.level);
  const targetLevel = Number(target.level);

  const multiplier = elementMultiplier(attacker, target);

  const attackPower = Math.floor(
    Number(attacker.pp) * multiplier
  );

  const defensePower = Number(target.gp);

  // SPがなければレベルを初期値にする
  if (target.shield === undefined) {
    target.shield = targetLevel;
  }

  // 攻撃キャラクターはこのターン再攻撃できない
  attacker.hasAttacked = true;

  // --------------------------------
  // 1. レベルが高い側から攻撃された場合
  // --------------------------------
  if (attackLevel >= targetLevel) {
    target.shield = 0;

    const targetIndex = row.findIndex(
      card => card.id === target.id
    );

    if (targetIndex !== -1) {
      row.splice(targetIndex, 1);
    }

    log(
      `${attacker.name}（Lv.${attackLevel}）が` +
      `${target.name}（Lv.${targetLevel}）を撃破しました。`
    );

    message(
      `${target.name}はレベル差により撃破されました！`
    );

    // PPがGPを上回っていれば、差分を相手ライフへ与える
    if (attackPower > defensePower) {
      const damage = attackPower - defensePower;

      const defender = state.players[target.owner];

      defender.life = Math.max(0, defender.life - damage);

      log(
        `攻撃力が防御力を${damage}上回り、` +
        `${defender.name}に${damage}ダメージ。`
      );
    }

    return;
  }

  // --------------------------------
  // 2. 攻撃側のレベルが低い場合
  // --------------------------------

  // SPを攻撃側のレベル分だけ減らす
  // 例：SP5にLv3で攻撃 → SP2
  target.shield = Math.max(
    0,
    Number(target.shield) - attackLevel
  );

  log(
    `${attacker.name}（Lv.${attackLevel}）が` +
    `${target.name}を攻撃。SPは${target.shield}。`
  );

  // PPがGPを上回る場合だけ、差分ダメージを与える
  // GPそのものは変更しない
  if (attackPower > defensePower) {
    const damage = attackPower - defensePower;

    const defender = state.players[target.owner];

    defender.life = Math.max(0, defender.life - damage);

    log(
      `PPがGPを上回りました。` +
      `${defender.name}に${damage}ダメージ。` +
      `GPは${target.gp}のままです。`
    );

    message(
      `${target.name}に${damage}ダメージ！ ` +
      `SPは${target.shield}、GPは${target.gp}のままです。`
    );
  } else {
    // PPがGP以下の場合はライフダメージなし
    log(
      `PP ${attackPower} はGP ${defensePower}以下。` +
      `ダメージなし。SPは${target.shield}。`
    );

    message(
      `ダメージなし。${target.name}のSPは${target.shield}です。`
    );
  }

  // --------------------------------
  // 3. SPが0になったら消滅
  // --------------------------------
  if (target.shield <= 0) {
    const targetIndex = row.findIndex(
      card => card.id === target.id
    );

    if (targetIndex !== -1) {
      row.splice(targetIndex, 1);
    }

    log(`${target.name}のSPが0になり、消滅しました。`);

    message(
      `${target.name}のシールドが砕け、撃破されました！`
    );
  }
}

// ================================
// ダイレクト攻撃
// ================================
function directAttack() {
  const attacker = findAttacker();
  const enemy = state.players[1];

  if (!attacker) {
    message("先に攻撃可能なキャラクターを選んでください。");
    return;
  }

  if (enemy.front.length || enemy.back.length) {
    message("相手の前衛キャラ、次に後衛のアイテムを先に攻撃してください。");
    return;
  }

  enemy.life = Math.max(0, enemy.life - attacker.pp);

  attacker.hasAttacked = true;

  log(
    `${attacker.name}がダイレクト攻撃。${attacker.pp}ダメージ。`
  );

  message(
    `ダイレクト攻撃成功！ ${attacker.pp}ダメージ。` +
    `相手のライフは${enemy.life}です。`
  );

  state.selectedAttackerId = null;

  checkGameOver();
  render();
}

// ================================
// ゲーム終了判定
// ================================
function checkGameOver() {
  const [me, enemy] = state.players;

  if (me.life <= 0 || enemy.life <= 0) {
    state.phase = "gameover";

    message(
      enemy.life <= 0
        ? "あなたの勝利です！"
        : "あなたの敗北です。"
    );

    log("ゲーム終了。");
  }
}

// ================================
// ターン終了
// ================================
async function endTurn() {
  if (
    state.currentPlayer !== 0 ||
    state.phase !== "main" ||
    state.busy
  ) {
    return;
  }

  state.selectedAttackerId = null;
  state.busy = true;
  state.phase = "enemy";

  log("自分のターンを終了しました。");
  message("相手のターンです。");

  render();

  await new Promise(resolve => setTimeout(resolve, 350));

  const enemy = state.players[1];
  const me = state.players[0];

  drawCards(enemy, 1);

  log("相手は1枚ドローしました。");

  // 簡易CPU：配置できるカードを1枚配置
  const idx = enemy.hand.findIndex(card =>
    card.type === "item"
      ? enemy.back.length < MAX_BACK
      : enemy.front.length < MAX_FRONT
  );

  if (idx >= 0) {
    const card = enemy.hand.splice(idx, 1)[0];

    if (card.type === "item") {
      enemy.back.push(card);
    } else {
      card.canAttack = false;
      card.hasAttacked = false;

      if (card.shield === undefined) {
        card.shield = card.level;
      }

      enemy.front.push(card);
    }

    log(`相手は「${card.name}」を配置しました。`);
  }

  // 相手の攻撃
  for (const attacker of allCharacters(enemy)) {
    if (state.phase === "gameover") break;

    if (!attacker.canAttack || attacker.hasAttacked) {
      continue;
    }

    const target = me.front[0];

    if (target) {
      resolveCharacterBattle(attacker, target, me.front);
    } else if (me.back.length) {
      const item = me.back.shift();

      log(
        `相手の${attacker.name}が` +
        `アイテム「${item.name}」を破壊しました。`
      );

      attacker.hasAttacked = true;
    } else {
      me.life = Math.max(0, me.life - attacker.pp);

      attacker.hasAttacked = true;

      log(
        `相手の${attacker.name}が直接攻撃。` +
        `${attacker.pp}ダメージ。`
      );
    }

    checkGameOver();
  }

  if (state.phase === "gameover") {
    state.busy = false;
    render();
    return;
  }

  state.currentPlayer = 0;
  state.turn++;
  state.phase = "main";

  me.turnsTaken++;

  drawCards(me, 1);

  for (const card of allCharacters(me)) {
    card.canAttack = true;
    card.hasAttacked = false;
  }

  for (const card of allCharacters(enemy)) {
    card.canAttack = true;
    card.hasAttacked = false;
  }

  state.busy = false;

  log("自分のターン開始。1枚ドローしました。");

  message("カードを配置し、攻撃しましょう。");

  render();
}

// ================================
// ボタン設定
// ================================
document
  .getElementById("end-turn-button")
  .addEventListener("click", endTurn);

document
  .getElementById("cancel-attack-button")
  .addEventListener("click", () => {
    state.selectedAttackerId = null;

    message(
      "攻撃選択をキャンセルしました。ダメージは発生しません。"
    );

    render();
  });

document
  .getElementById("enemy-status-area")
  .addEventListener("click", () => {
    if (
      state.currentPlayer !== 0 ||
      state.phase !== "main" ||
      state.busy
    ) {
      return;
    }

    if (!findAttacker()) {
      message("先に攻撃可能なキャラクターを選んでください。");
      return;
    }

    directAttack();
  });

// ================================
// ゲーム起動
// ================================
loadCardData()
  .then(startGame)
  .catch(error => {
    console.error(error);

    message(
      `${error.message}。Live Serverなどのローカルサーバーから開いてください。`
    );
  });

