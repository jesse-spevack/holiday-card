// The silly looks, a hidden extra. The look picker offers silly looks (a robot, a ninja, a dragon) next to the regular ones.
// The guest finds this extra when a member of their own family wears a silly look.

export default {
  name: "silly",
  hints: [{ host: "daughter", text: "My favorite looks are the silly ones." }],
  // The silly looks hint needs a family of your own to dress up.
  fits: ({ mine }) => mine().length > 0,
  setup: () => ({ look: (sprite, look) => !!look.silly }),
};
