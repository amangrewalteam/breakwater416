// src/lib/cardIssuer.ts
import fs from "fs";
import path from "path";
import crypto from "crypto";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CardStatus = "active" | "paused" | "cancelled";

export type Card = {
  id: string;
  userId: string;
  nickname: string;
  last4: string;
  status: CardStatus;
  /** Spend cap in cents; null means unlimited */
  limitCents: number | null;
  currency: string;
  /** Optional link to a tracked subscription */
  subscriptionId?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateCardOpts = {
  nickname: string;
  limitCents?: number;
  currency?: string;
  subscriptionId?: string;
};

// ── Provider interface ────────────────────────────────────────────────────────

export interface CardIssuer {
  list(userId: string): Promise<Card[]>;
  create(userId: string, opts: CreateCardOpts): Promise<Card>;
  pause(userId: string, cardId: string): Promise<Card>;
  unpause(userId: string, cardId: string): Promise<Card>;
  setLimit(userId: string, cardId: string, limitCents: number | null): Promise<Card>;
  rotate(userId: string, cardId: string): Promise<Card>;
}

// ── Stub (file-based) implementation ─────────────────────────────────────────

const STORE_PATH = path.join(process.cwd(), ".cards.json");

function readStore(): Card[] {
  if (!fs.existsSync(STORE_PATH)) return [];
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    return JSON.parse(raw) as Card[];
  } catch {
    return [];
  }
}

function writeStore(cards: Card[]) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(cards, null, 2), "utf8");
}

function randomLast4(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function now(): string {
  return new Date().toISOString();
}

class StubCardIssuer implements CardIssuer {
  async list(userId: string): Promise<Card[]> {
    return readStore()
      .filter((c) => c.userId === userId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async create(userId: string, opts: CreateCardOpts): Promise<Card> {
    const card: Card = {
      id: crypto.randomUUID(),
      userId,
      nickname: opts.nickname,
      last4: randomLast4(),
      status: "active",
      limitCents: opts.limitCents ?? null,
      currency: opts.currency ?? "CAD",
      subscriptionId: opts.subscriptionId,
      createdAt: now(),
      updatedAt: now(),
    };
    const cards = readStore();
    cards.push(card);
    writeStore(cards);
    return card;
  }

  async pause(userId: string, cardId: string): Promise<Card> {
    return this._update(userId, cardId, (c) => {
      if (c.status !== "active") throw new Error("Card is not active");
      return { status: "paused" as CardStatus };
    });
  }

  async unpause(userId: string, cardId: string): Promise<Card> {
    return this._update(userId, cardId, (c) => {
      if (c.status !== "paused") throw new Error("Card is not paused");
      return { status: "active" as CardStatus };
    });
  }

  async setLimit(userId: string, cardId: string, limitCents: number | null): Promise<Card> {
    return this._update(userId, cardId, () => ({ limitCents }));
  }

  async rotate(userId: string, cardId: string): Promise<Card> {
    return this._update(userId, cardId, () => ({ last4: randomLast4() }));
  }

  private _update(
    userId: string,
    cardId: string,
    patcher: (c: Card) => Partial<Card>
  ): Card {
    const cards = readStore();
    const idx = cards.findIndex((c) => c.id === cardId && c.userId === userId);
    if (idx === -1) throw new Error("Card not found");
    const patch = patcher(cards[idx]);
    cards[idx] = { ...cards[idx], ...patch, updatedAt: now() };
    writeStore(cards);
    return cards[idx];
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function getCardIssuer(): CardIssuer {
  // Future: swap in a real provider (Marqeta, Lithic, etc.) based on env
  return new StubCardIssuer();
}
