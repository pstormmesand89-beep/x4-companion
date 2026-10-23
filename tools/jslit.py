"""Minimal parser for JavaScript object literals as used in Roguey's data caches.

Parses plain data only (objects, arrays, strings, numbers, true/false/null,
unquoted keys). Never evaluates code.
"""


class JsLitError(ValueError):
    pass


class _Parser:
    def __init__(self, text):
        self.s = text
        self.i = 0

    def ws(self):
        s, n = self.s, len(self.s)
        while self.i < n:
            c = s[self.i]
            if c in " \t\r\n":
                self.i += 1
            elif s.startswith("//", self.i):
                j = s.find("\n", self.i)
                self.i = n if j < 0 else j + 1
            elif s.startswith("/*", self.i):
                j = s.find("*/", self.i)
                self.i = n if j < 0 else j + 2
            else:
                break

    def peek(self):
        self.ws()
        return self.s[self.i] if self.i < len(self.s) else ""

    def expect(self, c):
        if self.peek() != c:
            raise JsLitError(f"expected {c!r} at {self.i}: {self.s[self.i:self.i + 40]!r}")
        self.i += 1

    def value(self):
        c = self.peek()
        if c == "{":
            return self.obj()
        if c == "[":
            return self.arr()
        if c in "'\"":
            return self.string()
        return self.atom()

    def obj(self):
        self.expect("{")
        out = {}
        while True:
            if self.peek() == "}":
                self.i += 1
                return out
            c = self.peek()
            key = self.string() if c in "'\"" else self.ident()
            self.expect(":")
            out[key] = self.value()
            if self.peek() == ",":
                self.i += 1

    def arr(self):
        self.expect("[")
        out = []
        while True:
            if self.peek() == "]":
                self.i += 1
                return out
            out.append(self.value())
            if self.peek() == ",":
                self.i += 1

    def string(self):
        q = self.s[self.i]
        self.i += 1
        buf = []
        while True:
            c = self.s[self.i]
            if c == "\\":
                buf.append(self.s[self.i + 1])
                self.i += 2
            elif c == q:
                self.i += 1
                return "".join(buf)
            else:
                buf.append(c)
                self.i += 1

    def ident(self):
        self.ws()
        j = self.i
        while j < len(self.s) and (self.s[j].isalnum() or self.s[j] in "_$-."):
            j += 1
        if j == self.i:
            raise JsLitError(f"bad token at {self.i}: {self.s[self.i:self.i + 40]!r}")
        tok, self.i = self.s[self.i:j], j
        return tok

    def atom(self):
        tok = self.ident()
        if tok == "true":
            return True
        if tok == "false":
            return False
        if tok in ("null", "undefined"):
            return None
        try:
            return int(tok)
        except ValueError:
            try:
                return float(tok)
            except ValueError:
                raise JsLitError(f"unexpected token {tok!r}")


def parse_var(text, name):
    """Return the parsed literal assigned to `var <name> = ...` in text."""
    k = text.find(f"var {name}")
    if k < 0:
        raise JsLitError(f"var {name} not found")
    p = _Parser(text)
    p.i = text.index("=", k) + 1
    return p.value()
