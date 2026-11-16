import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluateArithmeticExpression } from "../../../src/utils/arithmetic.js";

Deno.test("CAE arithmetic evaluator respects precedence and parentheses", () => {
  assertEquals(evaluateArithmeticExpression("2 + 3 * 4"), 14);
  assertEquals(evaluateArithmeticExpression("(2 + 3) * 4"), 20);
  assertEquals(evaluateArithmeticExpression("100 / 4 - 3"), 22);
});

Deno.test("CAE arithmetic evaluator supports decimals and unary signs", () => {
  assertEquals(evaluateArithmeticExpression("-2.5 * (+4)"), -10);
  assertEquals(evaluateArithmeticExpression(".5 + 1."), 1.5);
});

Deno.test("CAE arithmetic evaluator rejects invalid or unsafe expressions", () => {
  assertEquals(evaluateArithmeticExpression("1 / 0"), null);
  assertEquals(evaluateArithmeticExpression("1 + unknown"), null);
  assertEquals(evaluateArithmeticExpression("alert(1)"), null);
  assertEquals(evaluateArithmeticExpression("1;2"), null);
  assertEquals(evaluateArithmeticExpression("2 ** 10"), null);
  assertEquals(evaluateArithmeticExpression("(" + "1+".repeat(70) + "1" + ")".repeat(70)), null);
  assertEquals(evaluateArithmeticExpression("1+".repeat(300) + "1"), null);
  assertEquals(evaluateArithmeticExpression("1".repeat(513)), null);
});
