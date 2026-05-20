import type { PluginToUIMessage } from '../../types';

function devPost(msg: PluginToUIMessage, delay: number): void {
  setTimeout(() => {
    window.dispatchEvent(new MessageEvent('message', { data: { pluginMessage: msg } }));
  }, delay);
}

export function installMockBridge(): void {
  devPost(
    {
      type: 'init',
      runtime: {
        editorType: 'slides',
        mode: 'default',
        command: 'open',
        vscode: false,
        debug: true,
      },
    },
    300,
  );

  devPost(
    {
      type: 'slide-loaded',
      summary: {
        id: 'dev-slide-1',
        number: 1,
        name: 'Slide 1 - Intro',
        isSkipped: false,
      },
      general: {
        titleDescription: {
          copyWrapId: 'cw-1',
          heading: 'Onze resultaten dit kwartaal',
          paragraph: 'Een korte toelichting op de cijfers en context.',
          headingVisible: true,
          paragraphVisible: true,
          size: {
            current: 'H1',
            options: ['H3', 'H2', 'H1', 'Display'],
          },
          headingDim: [[6, 19]],
        },
        badge: {
          badgeNodeId: 'badge-1',
          label: 'Q1 2026',
          icon: 'trending-up',
          iconIntended: 'trending-up',
          visible: true,
        },
        image: {
          imageWrapId: 'iw-1',
          imageHash: null,
        },
        theme: null,
      },
      content: {
        cardWrapId: 'wrap-1',
        cards: [
          {
            cardNodeId: 'c-1',
            heading: 'Omzet',
            paragraph: 'Totale omzet gestegen met 12% t.o.v. vorig kwartaal.',
            icon: 'euro',
            iconIntended: 'euro',
            visualHash: null,
            style: 'Default',
          },
          {
            cardNodeId: 'c-2',
            heading: 'Klanten',
            paragraph: 'Aantal actieve klanten is dit kwartaal met 8% gegroeid.',
            icon: 'users',
            iconIntended: 'users',
            visualHash: undefined,
            style: 'Outline',
          },
          {
            cardNodeId: 'c-3',
            heading: 'NPS',
            paragraph: 'Net Promoter Score stabiel op 42.',
            icon: 'heart',
            iconIntended: 'heart',
            visualHash: null,
            style: 'Default',
          },
        ],
        timelineItems: [
          {
            copyWrapNodeId: 'timeline-1',
            heading: 'Eerste contact',
            paragraph: 'De klant ziet de waarde direct.',
          },
        ],
      },
      graphs: null,
    },
    600,
  );

  devPost({ type: 'icons-ready' }, 800);
  devPost({ type: 'icon-recents', items: ['trending-up', 'monitor', 'users'] }, 900);
  devPost({ type: 'onboarding-seen', seen: false }, 950);
}
