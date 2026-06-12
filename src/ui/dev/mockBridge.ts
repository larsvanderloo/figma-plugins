import type { PluginToUIMessage } from '../../shared/types';

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
        instructorCards: [
          {
            cardNodeId: 'instructor-1',
            instructor: 'Gijs',
            instructorOptions: ['Gijs', 'Myra', 'Sanne'],
            items: [
              'Sterke achtergrond in recruitment',
              'Houdt liever de achterdeur dicht',
              'Zal je uitdagen om buiten de paden te denken',
            ],
            visible: true,
          },
          {
            cardNodeId: 'instructor-2',
            instructor: 'Myra',
            instructorOptions: ['Gijs', 'Myra', 'Sanne'],
            items: ['Specialist arbeidsrecht', 'Praktijkgericht', 'Scherpe humor'],
            visible: false,
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
      graphs: {
        selectedGraphId: 'slot-1',
        instances: [
          {
            nodeId: 'slot-1',
            label: 'Tabel',
            tableModel: {
              slotId: 'slot-1',
              hasColumnHeader: true,
              columnCalculations: [null, 'sum', 'sum'],
              columnCalculationEmphasis: [false, true, true],
              columnCalculationCurrency: [false, false, true],
              rows: [
                {
                  rowNodeId: 'row-0',
                  cells: [
                    { cellNodeId: 'cell-0-0', value: 'Metric' },
                    { cellNodeId: 'cell-0-1', value: 'Q1' },
                    { cellNodeId: 'cell-0-2', value: 'Q2' },
                  ],
                },
                {
                  rowNodeId: 'row-1',
                  cells: [
                    { cellNodeId: 'cell-1-0', value: 'Omzet' },
                    { cellNodeId: 'cell-1-1', value: '€ 1,2M' },
                    { cellNodeId: 'cell-1-2', value: '€ 1,4M' },
                  ],
                },
                {
                  rowNodeId: 'row-2',
                  cells: [
                    { cellNodeId: 'cell-2-0', value: 'Klanten' },
                    { cellNodeId: 'cell-2-1', value: '184' },
                    { cellNodeId: 'cell-2-2', value: '211' },
                  ],
                },
                {
                  rowNodeId: 'row-3',
                  cells: [
                    { cellNodeId: 'cell-3-0', value: 'NPS' },
                    { cellNodeId: 'cell-3-1', value: '42' },
                    { cellNodeId: 'cell-3-2', value: '45' },
                  ],
                },
              ],
            },
          },
        ],
      },
    },
    600,
  );

  devPost({ type: 'icons-ready' }, 800);
  devPost({ type: 'icon-recents', items: ['trending-up', 'monitor', 'users'] }, 900);
  devPost({ type: 'onboarding-seen', seen: false }, 950);
}
