import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';

import { WatchlistAiChatComponent } from './watchlist-ai.chat';
import { OpenAiService } from '../../../core/services/openai.service';

describe('WatchlistAiChatComponent', () => {
  let component: WatchlistAiChatComponent;
  let fixture: ComponentFixture<WatchlistAiChatComponent>;
  let stream: Subject<string>;

  beforeEach(async () => {
    stream = new Subject<string>();

    await TestBed.configureTestingModule({
      imports: [WatchlistAiChatComponent],
      providers: [{ provide: OpenAiService, useValue: { stream: () => stream } }],
    }).compileComponents();

    fixture = TestBed.createComponent(WatchlistAiChatComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  /** Send a message and let the fake stream answer it. */
  const exchange = (text: string, reply: string): void => {
    component.inputText = text;
    component.onSend();
    stream.next(reply);
    stream.complete();
    stream = new Subject<string>();
    TestBed.inject(OpenAiService).stream = () => stream as never;
  };

  it('keeps a separate thread per mode', () => {
    exchange('what tonight?', 'Watch **Heat**');
    expect(component.displayMessages().map((m) => m.text)).toEqual([
      'what tonight?',
      'Watch **Heat**',
    ]);

    component.setMode('add');
    expect(component.displayMessages()).toEqual([]);

    exchange('something new', 'Try **Tampopo**');
    expect(component.displayMessages().map((m) => m.text)).toEqual([
      'something new',
      'Try **Tampopo**',
    ]);

    // Back to the first thread: still there, and untouched by the second.
    component.setMode('list');
    expect(component.displayMessages().map((m) => m.text)).toEqual([
      'what tonight?',
      'Watch **Heat**',
    ]);
    expect(component.history['list'].some((m) => m.content === 'something new')).toBe(false);
  });

  it('lands a reply in the thread it was sent from, not the one on screen', () => {
    component.inputText = 'what tonight?';
    component.onSend();

    component.setMode('add'); // user switches while the reply is still streaming
    stream.next('Watch **Heat**');
    stream.complete();

    expect(component.displayMessages()).toEqual([]);
    component.setMode('list');
    expect(component.displayMessages().map((m) => m.text)).toEqual([
      'what tonight?',
      'Watch **Heat**',
    ]);
  });

  it('refreshes the system prompt without dropping the turns', () => {
    exchange('what tonight?', 'Watch **Heat**');

    component.buildContext([]);

    const list = component.history['list'];
    expect(list.filter((m) => m.role === 'system').length).toBe(1);
    expect(list[0].role).toBe('system');
    expect(list.map((m) => m.content).slice(1)).toEqual(['what tonight?', 'Watch **Heat**']);
  });
});
