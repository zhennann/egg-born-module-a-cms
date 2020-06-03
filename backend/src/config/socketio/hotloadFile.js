module.exports = app => {
  async function onCheck({ io, ctx, path, message, options, user }) {
    // only by system
    return user.id === 0;
  }

  const progress = {
    info: {
      title: 'Hotload File',
      persistence: false,
    },
    callbacks: {
      onCheck,
    },
  };
  return progress;
};
