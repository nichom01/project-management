class LocalStorageService {
  constructor() {
    this.files = new Map();
  }

  upload(filename, contentBase64) {
    const key = `file-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    this.files.set(key, { filename, contentBase64 });
    return { key, url: `/storage/${key}` };
  }

  delete(key) {
    this.files.delete(key);
  }
}

function createStorageService() {
  return new LocalStorageService();
}

module.exports = {
  createStorageService,
};
