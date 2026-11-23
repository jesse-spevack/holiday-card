// Demo mode: "/#demo" shows the site as a guest who just signed up, with a made-up family, for example on a preview.
// The page reads the real party, so the demo family stands among the real guests. Nothing leaves the page:
// api.js answers every write here (demoWrite), so no sign-up, no Sheet call, no D1 write, and no interaction record.
// The demo family and its finds live in memory only, so a reload starts fresh, and the browser's real data stays as it was.

export const DEMO = typeof location !== "undefined" && location.hash === "#demo";

// Made-up people. The looks come from public/assets/looks.json. A look that is not there gets a look of its type.
export function demoFamily() {
  return {
    id: "demo-family",
    token: "demo",
    name: "The Demo Family",
    members: [
      { type: "adult", look: "adult-11" },
      { type: "adult", look: "adult-04" },
      { type: "kid", look: "kid-04" },
      { type: "dog", look: "dog-06" },
    ],
    bubbles: ["Happy holidays!", "", "Is it snowing yet?", "Woof!"],
  };
}

// A made-up address on file. "Change address" changes this copy only.
let onFile = {
  envelope: "The Demo Family",
  address: { street: "1428 Maple Ave", unit: "", city: "Evanston", state: "IL", zip: "60201" },
};

// The reply that the Worker would give, with no call. An unknown write fails, so a new route cannot slip out of demo mode.
export async function demoWrite(path, body = {}) {
  switch (path) {
    case "/api/sprite":
      return { ok: true };
    case "/api/interaction":
      return {};
    case "/api/address/read":
      return structuredClone(onFile);
    case "/api/address/change": {
      const { street = "", unit = "", city = "", state = "", zip = "" } = body.address || {};
      onFile = { envelope: body.envelope, address: { street, unit, city, state, zip } };
      return { ok: true, name: body.envelope };
    }
    case "/api/household":
      return { members: [{ type: "adult" }] };
    case "/api/submit":
      return { id: `demo-${Date.now()}`, token: "demo" };
    case "/api/invite":
      throw new Error("bad_invite");
  }
  throw new Error("demo_mode");
}
