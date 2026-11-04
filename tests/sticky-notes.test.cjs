const assert = require("node:assert/strict");
const test = require("node:test");
const { database } = require("./storage-harness.cjs");
const { domContext, load, settle } = require("./audit-helpers.cjs");

test("two independent productivity contexts edit different notes on the same page without loss", async () => {
  const key = "http://bc-test.instructure.com/";
  const db = database({ bcLocal: { notes: { [key]: [
    { id: "a", text: "old A", x: 120, y: 130 }, { id: "b", text: "old B", x: 220, y: 230 },
  ] } } });
  async function view() {
    const tab = db.client(), page = domContext("", { chrome: tab.chrome });
    load(page.context, "src/shared/defaults.js", "src/content/core/util.js", "src/content/core/lifecycle.js", "src/content/core/storage.js");
    const BC = page.context.BC;
    BC.injector = { setStyle() {}, removeNode() {} }; BC.util.debounce = (fn) => fn;
    await BC.storage.load();
    load(page.context, "src/content/features/productivity.js");
    BC.features.productivity.apply({ productivity: { stickyNotes: true, quickActions: false } });
    await settle();
    return { ...page, BC };
  }
  const a = await view(), b = await view();
  try {
    const edit = (page, id, text) => {
      const input = page.dom.window.document.querySelector(`[data-note-id="${id}"] textarea`);
      input.value = text; input.dispatchEvent(new page.dom.window.Event("input"));
    };
    edit(a, "a", "new A"); edit(b, "b", "new B");
    await Promise.all([a.BC.storage.updateLocal(() => {}), b.BC.storage.updateLocal(() => {})]);
    assert.deepEqual(db.data.bcLocal.notes[key], [
      { id: "a", text: "new A", x: 120, y: 130 }, { id: "b", text: "new B", x: 220, y: 230 },
    ]);
    // A stale editor cannot recreate a note deleted in another context.
    b.dom.window.document.querySelector('[data-note-id="a"] button').click();
    await b.BC.storage.updateLocal(() => {});
    edit(a, "a", "stale"); await a.BC.storage.updateLocal(() => {});
    assert.deepEqual(db.data.bcLocal.notes[key].map((n) => n.id), ["b"]);
    assert.ok(db.requests.every((keys) => JSON.stringify(keys) === '["bcLocal"]' || JSON.stringify(keys) === '["bcSettings","bcLocal"]'));
    b.BC.util.warn = () => {}; db.fail("quota");
    edit(b, "b", "retain unsaved text"); await b.BC.storage.updateLocal(() => {});
    b.BC.features.productivity.apply({ productivity: { stickyNotes: true, quickActions: false } }); await settle();
    assert.equal(b.dom.window.document.querySelector('[data-note-id="b"] textarea').value, "retain unsaved text");
    b.BC.quickNote(); await b.BC.storage.updateLocal(() => {}); await settle();
    assert.equal(b.dom.window.document.querySelectorAll('[data-note-id]').length, 1, "failed creation does not mount an unpersisted note");
    db.fail(null); edit(b, "b", "retain unsaved text"); await b.BC.storage.updateLocal(() => {});
    assert.equal(db.data.bcLocal.notes[key][0].text, "retain unsaved text");
    db.fail("quota");
    b.dom.window.document.querySelector('[data-note-id="b"] button').click();
    await b.BC.storage.updateLocal(() => {}); await settle();
    assert.ok(b.dom.window.document.querySelector('[data-note-id="b"] textarea'), "failed deletion leaves the editor open");
    db.fail(null); b.dom.window.document.querySelector('[data-note-id="b"] button').click();
    await b.BC.storage.updateLocal(() => {}); await settle();
    assert.equal(b.dom.window.document.querySelector('[data-note-id="b"]'), null);
  } finally { a.BC.features.productivity.unmount(); b.BC.features.productivity.unmount(); a.dom.window.close(); b.dom.window.close(); }
});

test("a sticky note drags with a finger or pen and its delete button still works", async () => {
  const key = "http://bc-test.instructure.com/";
  const db = database({ bcLocal: { notes: { [key]: [{ id: "a", text: "A", x: 100, y: 100 }] } } });
  const page = domContext("", { chrome: db.client().chrome });
  try {
    load(page.context, "src/shared/defaults.js", "src/content/core/util.js", "src/content/core/lifecycle.js", "src/content/core/storage.js");
    const BC = page.context.BC, W = page.dom.window;
    BC.injector = { setStyle() {}, removeNode() {} }; BC.util.debounce = (fn) => fn;
    await BC.storage.load();
    load(page.context, "src/content/features/productivity.js");
    BC.features.productivity.apply({ productivity: { stickyNotes: true, quickActions: false } });
    await settle();
    const head = W.document.querySelector(".bc-note-head");
    const fire = (type, target, x, y) => target.dispatchEvent(new W.PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 1, pointerType: "touch", clientX: x, clientY: y }));
    fire("pointerdown", head, 110, 110); fire("pointermove", head, 160, 190); fire("pointerup", head, 160, 190);
    await BC.storage.updateLocal(() => {});
    // jsdom has no layout, so offsets start at 0 and the note lands at the 50px moved.
    assert.equal(W.document.querySelector(".bc-note").style.left, "50px");
    fire("pointerdown", W.document.querySelector(".bc-note-x"), 0, 0);
    W.document.querySelector(".bc-note-x").click();
    await BC.storage.updateLocal(() => {}); await settle();
    assert.deepEqual(db.data.bcLocal.notes[key] || [], []);
  } finally { page.dom.window.close(); }
});
