const socketHandler = (io) => {
  io.on("connection", (socket) => {
    console.log("Connected:", socket.id);

    socket.on("join-room", (roomId) => {
      socket.join(roomId);
      console.log(socket.id, "joined room", roomId);
    });

    socket.on("command", (data) => {
      if (data && data.roomId) {
        socket.to(data.roomId).emit("command", data.command);
      }
    });

    socket.on("state-update", (data) => {
      if (data && data.roomId) {
        socket.to(data.roomId).emit("state-update", data.state);
      }
    });

    socket.on("request-sync", (roomId) => {
      socket.to(roomId).emit("request-sync");
    });

    socket.on("disconnect", () => {
      console.log("Disconnected:", socket.id);
    });
  });
};

module.exports = socketHandler;