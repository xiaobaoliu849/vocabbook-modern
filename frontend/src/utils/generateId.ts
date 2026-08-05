export const generateId = (): string => {
    return (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9);
};
