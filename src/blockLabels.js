const genericLabels = {
  wood: ['oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log', 'dark_oak_log'],
  leaves: ['oak_leaves', 'birch_leaves', 'spruce_leaves', 'jungle_leaves', 'acacia_leaves', 'dark_oak_leaves'],
  planks: ['oak_planks', 'birch_planks', 'spruce_planks', 'jungle_planks', 'acacia_planks', 'dark_oak_planks'],
  // Add more generic labels as needed
};

function getSpecificBlockTypes(blockType) {
  if (genericLabels[blockType]) {
    return genericLabels[blockType];
  }
  return [blockType];
}

module.exports = {
  genericLabels,
  getSpecificBlockTypes
};