declare module 'diff' {
  export type Change = {
    value: string;
    added?: boolean;
    removed?: boolean;
  };

  export function diffLines(
    oldStr: string,
    newStr: string,
    options?: {
      newlineIsToken?: boolean;
      ignoreWhitespace?: boolean;
    },
  ): Change[];
}

