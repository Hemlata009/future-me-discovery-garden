import { describe, expect, it, vi, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ParentQuestionBox } from "@/components/parent-brief-tools";

vi.mock("@/lib/tracking", () => ({ ensureVisitor: vi.fn(async () => {}), track: vi.fn() }));

function reply(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}
async function ask() {
  render(<ParentQuestionBox briefId="b1" />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Fees?" } });
  fireEvent.click(screen.getByRole("button", { name: /ask question/i }));
}
afterEach(() => vi.unstubAllGlobals());

describe("grounded Q&A states", () => {
  it("labels a grounded answer as from verified facts", async () => {
    reply(200, { ok: true, answer: "Year one covers programming basics.", remaining: 2 });
    await ask();
    expect(await screen.findByText(/From verified NIAT facts/)).toBeTruthy();
    expect(screen.getByText("2 of 3 left")).toBeTruthy();
  });
  it("shows the counsellor fallback card with a call button", async () => {
    reply(200, { ok: true, answer: "Please ask a NIAT counsellor", remaining: 1 });
    await ask();
    expect(await screen.findByText("We can't answer that from the verified facts.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /request a call/i })).toBeTruthy();
  });
  it("replaces the input with a limit card after three questions", async () => {
    reply(200, { ok: true, answer: "Year one covers programming basics.", remaining: 0 });
    await ask();
    expect(await screen.findByText(/asked all three questions/)).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("0 of 3 left")).toBeTruthy();
  });
});
