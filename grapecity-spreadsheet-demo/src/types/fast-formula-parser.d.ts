declare module 'fast-formula-parser' {
  interface CellRef {
    sheet?: string;
    row: number;
    col: number;
  }
  interface RangeRef {
    sheet?: string;
    from: { row: number; col: number };
    to: { row: number; col: number };
  }
  /** What a custom function receives for each argument. */
  export interface FunctionArg {
    value: unknown;
    isArray?: boolean;
    isRangeRef?: boolean;
    isCellRef?: boolean;
  }
  export interface FormulaParserConfig {
    onCell?: (ref: CellRef) => unknown;
    onRange?: (ref: RangeRef) => unknown[][];
    functions?: Record<string, (...args: FunctionArg[]) => unknown>;
  }
  export class FormulaError extends Error {
    error: string;
    static DIV0: FormulaError;
    static NA: FormulaError;
    static NAME: FormulaError;
    static NUM: FormulaError;
    static REF: FormulaError;
    static VALUE: FormulaError;
  }
  export default class FormulaParser {
    constructor(options?: FormulaParserConfig);
    parse(formula: string, position: CellRef, allowReturnArray?: boolean): unknown;
  }
}
