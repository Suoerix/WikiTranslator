export interface Position {
  start: number;
  end: number;
  line?: number;
}

export interface InternalLink {
  target: string;
  display?: string;
  anchor?: string;
  position?: Position;
}

export interface Template {
  name: string;
  parameters: Map<string, string>;
  position?: Position;
}

export interface Category {
  name: string;
  sortKey?: string;
}

export interface WikitextDocument {
  raw: string;
  links: InternalLink[];
  templates: Template[];
  categories: Category[];
}
