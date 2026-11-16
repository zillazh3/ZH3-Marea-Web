let connected = $state(false);

export const spotifyStatus = {
  get connected(): boolean {
    return connected;
  },
  setConnected(value: boolean): void {
    connected = value;
  },
};
