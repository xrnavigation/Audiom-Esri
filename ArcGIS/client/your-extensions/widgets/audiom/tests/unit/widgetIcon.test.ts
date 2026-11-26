import {
  BROKEN_WIDGET_ICON,
  publishedWidgetIconUrl,
  repairedWidgetIcon,
  WidgetFolderFile
} from '../../src/setting/widgetIcon'

const FOLDER = 'https://esri.xrnavigation.io/builder-versions/1.20/audiom/'
const ICON = `${FOLDER}${WidgetFolderFile.Icon}`
const BROKEN = `https://portal.local:7443/arcgis/apps/experiencebuilder/cdn/356/${BROKEN_WIDGET_ICON}`

describe('published widget icon', () => {
  it('points a remote widget folder at the published icon', () => {
    expect(publishedWidgetIconUrl(FOLDER)).toBe(ICON)
    expect(publishedWidgetIconUrl(`${FOLDER}${WidgetFolderFile.Manifest}`)).toBe(ICON)
    expect(publishedWidgetIconUrl(FOLDER.slice(0, -1))).toBe(ICON)
  })

  it('does not invent an icon for a local widget uri', () => {
    expect(publishedWidgetIconUrl('widgets/audiom/')).toBeUndefined()
    expect(publishedWidgetIconUrl(undefined)).toBeUndefined()
    expect(repairedWidgetIcon('widgets/audiom/', undefined)).toBeUndefined()
  })

  it('replaces the undefined folder icon and leaves a chosen icon', () => {
    expect(repairedWidgetIcon(FOLDER, BROKEN)).toBe(ICON)
    expect(repairedWidgetIcon(FOLDER, BROKEN_WIDGET_ICON)).toBe(ICON)
    expect(repairedWidgetIcon(FOLDER, undefined)).toBe(ICON)
    expect(repairedWidgetIcon(FOLDER, ICON)).toBeUndefined()
    expect(repairedWidgetIcon(FOLDER, { svg: 'data:image/svg+xml,chosen' })).toBeUndefined()
  })
})
