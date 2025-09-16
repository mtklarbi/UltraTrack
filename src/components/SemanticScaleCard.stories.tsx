import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import SemanticScaleCard from './SemanticScaleCard';

const meta: Meta<typeof SemanticScaleCard> = {
  title: 'Components/SemanticScaleCard',
  component: SemanticScaleCard,
  argTypes: {
    left: { control: 'text' },
    right: { control: 'text' },
    value: { control: { type: 'number', min: -10, max: 10, step: 1 } },
    min: { control: { type: 'number' } },
    max: { control: { type: 'number' } },
  },
};

export default meta;
type Story = StoryObj<typeof SemanticScaleCard>;

export const Default: Story = {
  render: (args) => {
    const [v, setV] = React.useState(args.value ?? 0);
    return (
      <div className="p-6">
        <SemanticScaleCard {...args} value={v} onChange={setV} />
      </div>
    );
  },
  args: {
    left: 'Intéressé',
    right: 'Pas intéressé',
    min: -3,
    max: 3,
    value: 0,
  },
};

export const CustomRange: Story = {
  render: (args) => {
    const [v, setV] = React.useState(args.value ?? 5);
    return (
      <div className="p-6">
        <SemanticScaleCard {...args} value={v} onChange={setV} />
      </div>
    );
  },
  args: {
    left: 'Bas',
    right: 'Haut',
    min: 0,
    max: 10,
    value: 5,
  },
};

