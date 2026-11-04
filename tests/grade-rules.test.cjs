const assert = require("node:assert/strict");
const test = require("node:test");
const vm = require("node:vm");
const { load } = require("./audit-helpers.cjs");
function total(groups) {
  const context = vm.createContext({ BC: { registry: { register() {} } } });
  load(context, "src/content/features/grades.js");
  return context.BC.grades.computeTotal(groups);
}
const assignment = (id, earned, possible, extra = {}) => ({ id, points_possible: possible, submission: { score: earned }, ...extra });
test("drop lowest keeps 100 percent for 0/10 and 10/10; never-drop is respected", () => {
  const group = { assignments: [assignment(1, 0, 10), assignment(2, 10, 10)], rules: { drop_lowest: 1 } };
  assert.equal(total([group]), 100);
  group.rules.never_drop = ["1"];
  assert.equal(total([group]), 50, "one droppable score must remain alongside never-drop assignments");
  group.assignments.push(assignment(3, 9, 10));
  assert.equal(total([group]), 50);
});
test("drop lowest maximizes the points ratio rather than dropping the lowest percentage", () => {
  const group = { group_weight: 100, assignments: [assignment(1, 50, 50), assignment(2, 65, 100), assignment(3, 12, 24)], rules: { drop_lowest: 1 } };
  assert.ok(Math.abs(total([group]) - 62 / 74 * 100) < 1e-10);
});
test("drop highest minimizes the group ratio, combines with lowest and ignores excused/ungraded work", () => {
  const group = { assignments: [assignment(1, 0, 10), assignment(2, 10, 10), assignment(3, 5, 10), assignment(4, null, 100), assignment(5, 0, 100, { submission: { score: 0, excused: true } })], rules: { drop_highest: 1 } };
  assert.equal(total([group]), 25);
  group.rules.drop_lowest = 1;
  assert.equal(total([group]), 50);
  group.rules.drop_lowest = 20;
  assert.equal(total([group]), 100);
});
test("multiple drops optimize the whole retained set and preserve extra credit", () => {
  const group = { assignments: [assignment(1, 0, 10), assignment(2, 8, 10), assignment(3, 90, 100), assignment(4, 5, 0)], rules: { drop_lowest: 2 } };
  assert.equal(total([group]), 130);
  assert.equal(total([{ assignments: [assignment(1, 10, 0)], rules: { drop_lowest: 1 } }]), null);
});
test("weighted totals use group scores after dropping and renormalize groups with no grades", () => {
  assert.equal(total([
    { group_weight: 40, assignments: [assignment(1, 0, 10), assignment(2, 10, 10)], rules: { drop_lowest: 1 } },
    { group_weight: 40, assignments: [assignment(3, 5, 10)] },
    { group_weight: 20, assignments: [assignment(4, null, 10)] },
  ]), 75);
});
test("weights adding up to more than 100 count as extra credit instead of being scaled down", () => {
  assert.ok(Math.abs(total([
    { group_weight: 40, assignments: [assignment(1, 9, 10)] },
    { group_weight: 60, assignments: [assignment(2, 8, 10)] },
    { group_weight: 5, assignments: [assignment(3, 10, 10)] },
  ]) - 89) < 1e-10);
});
test("group weights are ignored when the course has weighting turned off", () => {
  const context = vm.createContext({ BC: { registry: { register() {} } } });
  load(context, "src/content/features/grades.js");
  const groups = [
    { group_weight: 90, assignments: [assignment(1, 10, 10)] },
    { group_weight: 10, assignments: [assignment(2, 0, 90)] },
  ];
  assert.equal(context.BC.grades.computeTotal(groups, false), 10);
  assert.equal(context.BC.grades.computeTotal(groups, true), 90);
  assert.equal(context.BC.grades.computeTotal(groups), 90, "unknown falls back to the groups' weights");
});
