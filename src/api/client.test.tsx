import { resolveApiBases } from "./client";

beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, "", "/");
});

test("defaults to same-origin api before inferred host base", () => {
    expect(resolveApiBases()).toEqual(["", "http://localhost:3001"]);
});

test("stored absolute api base should not outrank same-origin api", () => {
    window.localStorage.setItem("cg.apiBase", "http://localhost:3001");
    expect(resolveApiBases()).toEqual(["", "http://localhost:3001"]);
});

test("explicit query api base should still take priority", () => {
    window.history.replaceState({}, "", "/?apiBase=http%3A%2F%2Fapi.example.com");
    expect(resolveApiBases()).toEqual([
        "http://api.example.com",
        "",
        "http://localhost:3001",
    ]);
});
