// Transactional in-memory Firestore seam used by API and worker regression tests.
export function memoryFirestore(initial = {}) {
  const rows = new Map(Object.entries(initial));
  let queue = Promise.resolve();
  let sequence = 0;
  const snapshot = (ref) => ({ref, id: ref.id, exists: rows.has(ref.path), data: () => structuredClone(rows.get(ref.path)), get: (key) => rows.get(ref.path)?.[key]});
  const reference = (path) => ({
    path, id: path.split("/").at(-1), get: async () => snapshot(reference(path)),
    set: async (data) => {rows.set(path, structuredClone(data));},
    collection: (name) => collection(`${path}/${name}`),
  });
  const collection = (name, filters = [], limit = Infinity, ordering = undefined) => {
    const query = {
      doc: (id = `auto-${++sequence}`) => reference(`${name}/${id}`),
      where: (field, op, value) => collection(name, [...filters, [field, op, value]], limit, ordering),
      orderBy: (field) => collection(name, filters, limit, field),
      limit: (value) => collection(name, filters, value, ordering),
      get: async () => ({docs: [...rows.entries()].filter(([path, data]) => path.startsWith(`${name}/`) && path.split("/").length === name.split("/").length + 1 && filters.every(([field, op, value]) => typeof data[field] === typeof value && (op === ">=" ? data[field] >= value : op === "<=" ? data[field] <= value : data[field] === value))).sort((a, b) => ordering ? a[1][ordering] - b[1][ordering] : 0).slice(0, limit).map(([path]) => snapshot(reference(path)))}),
    };
    return query;
  };
  return {
    rows, collection,
    runTransaction: (fn) => {
      const run = queue.then(async () => {
        const writes = [];
        const result = await fn({
          get: async (ref) => snapshot(ref),
          create: (ref, data) => {if (rows.has(ref.path)) throw new Error("Already exists"); writes.push(() => rows.set(ref.path, structuredClone(data)));},
          update: (ref, data) => writes.push(() => rows.set(ref.path, {...rows.get(ref.path), ...structuredClone(data)})),
          set: (ref, data, options) => writes.push(() => rows.set(ref.path, {...(options?.merge ? rows.get(ref.path) : {}), ...structuredClone(data)})),
          delete: (ref) => writes.push(() => rows.delete(ref.path)),
        });
        for (const write of writes) write();
        return result;
      });
      queue = run.catch(() => {});
      return run;
    },
  };
}
