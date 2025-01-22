if (typeof structuredClone !== 'function') {
    window.structuredClone = <T>(value: T) => {
      return JSON.parse(JSON.stringify(value)) as T
    };
}