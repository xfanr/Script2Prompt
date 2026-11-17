import { defineComponent, h, type Component } from 'vue'
import {
  AddFour, Attention, Back, CardTwo, CategoryManagement, CheckOne, CheckSmall, CircleRightUp, CityOne,
  CloseSmall, Copy, Crown, DataArrival, Delete as ParkDelete, Down, DownloadTwo,
  Edit, ExpandDown, FileMusic as ParkFileMusic, FileRemoval, FileSuccess as ParkFileSuccess, Flag as ParkFlag, FolderMinus, FolderSuccess, FormatBrush, GoStart as ParkGoStart, GoEnd as ParkGoEnd, FilePdf as ParkFilePdf, Gps, Lightning, Local, Message, Moon as ParkMoon, More, MoreOne, MovieBoard, Outdoor, Socks,
  FolderConversion as ParkFolderConversion, Peoples, PlaybackProgress, Plus as ParkPlus, PreviewOpen, Right, RightSmallUp, RightUser, Search as ParkSearch, SeoFolder, SettingTwo,
  Slide, SlideTwo, SortTwo, SplitTurnDownRight as ParkSplitTurnDownRight, Star as ParkStar, SubtractSelection, SubtractSelectionOne, SunOne, Switch as ParkSwitch, Sync,
  UploadTwo, User as ParkUser, VipOne, Voice, VoiceOff, Wallet,
} from '@icon-park/vue-next'
import '@icon-park/vue-next/styles/index.css'

// Keep existing call sites and Element Plus icon sizing while applying the chosen themes.
function icon(component: Component, theme: 'outline' | 'filled' | 'multi-color' = 'outline') {
  return defineComponent({
    name: 'AppIcon',
    setup: () => () => h(component, {
      theme, size: '1em', strokeWidth: 4,
      fill: theme === 'multi-color'
        ? ['var(--el-text-color-primary)', 'var(--el-color-primary)', 'var(--el-bg-color)', 'var(--el-color-primary-light-5)']
        : 'currentColor',
    }),
  })
}

export const AddIcon = icon(ParkPlus)
export const ArrowDown = icon(Down)
export const ArrowRight = icon(Right)
export const HomeBackIcon = icon(Back, 'filled')
export const PointBalanceIcon = icon(Lightning, 'filled')
export const CategoryManagementIcon = icon(CategoryManagement)
export const OrganizeScriptIcon = icon(FormatBrush)
export const Check = icon(CheckSmall)
export const CircleCheck = icon(CheckOne)
export const CircleCheckFilled = icon(CheckOne, 'filled')
export const Close = icon(CloseSmall)
export const CloseBold = icon(CloseSmall)
export const Coin = icon(Wallet)
export const CloneCharacters = icon(CardTwo)
export const OutfitDescriptionIcon = icon(Socks)
export const CopyDocument = icon(Copy)
export const CrownFilled = icon(Crown, 'filled')
export const DataAnalysis = icon(SlideTwo)
export const DataLine = icon(Slide)
export const Delete = icon(ParkDelete)
export const Document = icon(SlideTwo)
export const DocumentCopy = icon(RightSmallUp)
export const DialogueTabIcon = icon(Message, 'multi-color')
export const Download = icon(DownloadTwo)
export const EditPen = icon(Edit)
export const Expand = icon(ExpandDown)
export const ProjectFolder = icon(SeoFolder, 'multi-color')
export const FolderConversion = icon(ParkFolderConversion)
export const ProjectFolderFilled = ProjectFolder
export const ArchiveFolder = icon(FolderSuccess)
export const HistoryFolder = icon(FolderMinus, 'multi-color')
export const HistoryFolderFilled = HistoryFolder
export const FileMusic = icon(ParkFileMusic)
export const FileMusicFilled = icon(ParkFileMusic, 'filled')
export const FileRemovalFilled = icon(FileRemoval, 'filled')
export const FileSuccessFilled = icon(ParkFileSuccess, 'filled')
export const FilePdf = icon(ParkFilePdf)
export const FilePdfFilled = icon(ParkFilePdf, 'filled')
export const Flag = icon(ParkFlag, 'filled')
export const GoStart = icon(ParkGoStart)
export const GoEnd = icon(ParkGoEnd)
export const Grape = icon(Peoples)
export const GrapeFilled = icon(Peoples, 'filled')
export const MainCharacter = icon(RightUser)
export const MainCharacterFilled = icon(RightUser, 'filled')
export const Location = icon(CityOne)
export const SceneReferenceIcon = icon(Gps, 'filled')
export const PositionReference = icon(Local)
export const ScriptAnalysisIcon = icon(MovieBoard, 'multi-color')
export const Microphone = icon(Voice)
export const Moon = icon(ParkMoon)
export const MoreFilled = icon(More, 'filled')
export const MoreOneIcon = icon(MoreOne)
export const Mute = icon(VoiceOff)
export const Notebook = icon(Slide, 'multi-color')
export const Plus = icon(AddFour)
export const Position = icon(Outdoor)
export const Refresh = icon(Sync)
export const Search = icon(ParkSearch)
export const Setting = icon(SettingTwo)
export const Share = icon(CircleRightUp)
export const ShotTabIcon = icon(PlaybackProgress)
export const Sort = icon(SortTwo)
export const SplitTurnDownRight = icon(ParkSplitTurnDownRight)
export const Star = icon(ParkStar)
export const StarFilled = icon(ParkStar, 'filled')
export const PreviousEpisodeUnit = icon(SubtractSelectionOne)
export const NextEpisodeUnit = icon(SubtractSelection)
export const Sunny = icon(SunOne)
export const Switch = icon(ParkSwitch)
export const Tickets = icon(DataArrival)
export const Upload = icon(UploadTwo)
export const User = icon(ParkUser)
export const UserFilled = icon(ParkUser, 'filled')
export const View = icon(PreviewOpen)
export const VipFilled = icon(VipOne, 'filled')
export const WarningFilled = icon(Attention, 'filled')
