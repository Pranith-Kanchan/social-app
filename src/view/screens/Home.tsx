import React from 'react'
import {View, ActivityIndicator, StyleSheet} from 'react-native'
import {useFocusEffect} from '@react-navigation/native'
import {NativeStackScreenProps, HomeTabNavigatorParams} from 'lib/routes/types'
import {FeedDescriptor, FeedParams} from '#/state/queries/post-feed'
import {FollowingEmptyState} from 'view/com/posts/FollowingEmptyState'
import {FollowingEndOfFeed} from 'view/com/posts/FollowingEndOfFeed'
import {CustomFeedEmptyState} from 'view/com/posts/CustomFeedEmptyState'
import {FeedsTabBar} from '../com/pager/FeedsTabBar'
import {Pager, RenderTabBarFnProps} from 'view/com/pager/Pager'
import {FeedPage} from 'view/com/feeds/FeedPage'
import {HomeLoggedOutCTA} from '../com/auth/HomeLoggedOutCTA'
import {useSetMinimalShellMode, useSetDrawerSwipeDisabled} from '#/state/shell'
import {usePreferencesQuery} from '#/state/queries/preferences'
import {usePinnedFeedsInfos, FeedSourceInfo} from '#/state/queries/feed'
import {UsePreferencesQueryResponse} from '#/state/queries/preferences/types'
import {emitSoftReset} from '#/state/events'
import {useSession} from '#/state/session'
import {clamp} from '#/lib/numbers'
import * as persisted from '#/state/persisted'
import {isNative} from 'platform/detection'

type Props = NativeStackScreenProps<HomeTabNavigatorParams, 'Home'>
export function HomeScreen(props: Props) {
  const {data: preferences} = usePreferencesQuery()
  const {feeds: pinnedFeeds, isLoading: isPinnedFeedsLoading} =
    usePinnedFeedsInfos()
  const selectedPage = props.route.params?.feed || 'Following'
  const onSelectPage = React.useCallback(
    (nextSelectedPage: string) => {
      let params
      if (nextSelectedPage !== 'Following') {
        params = {feed: nextSelectedPage}
      }
      props.navigation.navigate('Home', params)
      if (isNative) {
        persisted.write('lastSelectedFeed', nextSelectedPage)
      }
    },
    [props.navigation],
  )
  if (preferences && pinnedFeeds && !isPinnedFeedsLoading) {
    return (
      <HomeScreenReady
        {...props}
        preferences={preferences}
        pinnedFeeds={pinnedFeeds}
        selectedPage={selectedPage}
        onSelectPage={onSelectPage}
      />
    )
  } else {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
      </View>
    )
  }
}

function HomeScreenReady({
  preferences,
  pinnedFeeds,
  selectedPage,
  onSelectPage,
}: Props & {
  preferences: UsePreferencesQueryResponse
  pinnedFeeds: FeedSourceInfo[]
  selectedPage: string
  onSelectPage: (nextSelectedPage: string) => void
}) {
  const {hasSession} = useSession()
  const setMinimalShellMode = useSetMinimalShellMode()
  const setDrawerSwipeDisabled = useSetDrawerSwipeDisabled()

  /**
   * Used to ensure that we re-compute `customFeeds` AND force a re-render of
   * the pager with the new order of feeds.
   */
  const pinnedFeedOrderKey = JSON.stringify(preferences.feeds.pinned)

  const selectedPageIndex = React.useMemo(() => {
    const index = ['Following', ...preferences.feeds.pinned].indexOf(
      selectedPage,
    )
    return Math.max(index, 0)
  }, [preferences.feeds.pinned, selectedPage])

  const customFeeds = React.useMemo(() => {
    const pinned = pinnedFeeds
    const feeds: FeedDescriptor[] = []
    for (const {uri} of pinned) {
      if (uri.includes('app.bsky.feed.generator')) {
        feeds.push(`feedgen|${uri}`)
      } else if (uri.includes('app.bsky.graph.list')) {
        feeds.push(`list|${uri}`)
      }
    }
    return feeds
  }, [pinnedFeeds])

  const homeFeedParams = React.useMemo<FeedParams>(() => {
    return {
      mergeFeedEnabled: Boolean(preferences.feedViewPrefs.lab_mergeFeedEnabled),
      mergeFeedSources: preferences.feedViewPrefs.lab_mergeFeedEnabled
        ? preferences.feeds.saved
        : [],
    }
  }, [preferences])

  useFocusEffect(
    React.useCallback(() => {
      setMinimalShellMode(false)
      setDrawerSwipeDisabled(selectedPageIndex > 0)
      return () => {
        setDrawerSwipeDisabled(false)
      }
    }, [setDrawerSwipeDisabled, selectedPageIndex, setMinimalShellMode]),
  )

  const onPageSelected = React.useCallback(
    (index: number) => {
      setMinimalShellMode(false)
      setDrawerSwipeDisabled(index > 0)
      const page = ['Following', ...preferences.feeds.pinned][index]
      onSelectPage(page)
    },
    [
      setDrawerSwipeDisabled,
      onSelectPage,
      setMinimalShellMode,
      preferences.feeds.pinned,
    ],
  )

  const onPressSelected = React.useCallback(() => {
    emitSoftReset()
  }, [])

  const onPageScrollStateChanged = React.useCallback(
    (state: 'idle' | 'dragging' | 'settling') => {
      if (state === 'dragging') {
        setMinimalShellMode(false)
      }
    },
    [setMinimalShellMode],
  )

  const renderTabBar = React.useCallback(
    (props: RenderTabBarFnProps) => {
      return (
        <FeedsTabBar
          key="FEEDS_TAB_BAR"
          selectedPage={props.selectedPage}
          onSelect={props.onSelect}
          testID="homeScreenFeedTabs"
          onPressSelected={onPressSelected}
        />
      )
    },
    [onPressSelected],
  )

  const renderFollowingEmptyState = React.useCallback(() => {
    return <FollowingEmptyState />
  }, [])

  const renderCustomFeedEmptyState = React.useCallback(() => {
    return <CustomFeedEmptyState />
  }, [])

  return hasSession ? (
    <Pager
      key={pinnedFeedOrderKey}
      testID="homeScreen"
      initialPage={clamp(selectedPageIndex, 0, customFeeds.length)}
      onPageSelected={onPageSelected}
      onPageScrollStateChanged={onPageScrollStateChanged}
      renderTabBar={renderTabBar}
      tabBarPosition="top">
      <FeedPage
        key="1"
        testID="followingFeedPage"
        isPageFocused={selectedPageIndex === 0}
        feed="home"
        feedParams={homeFeedParams}
        renderEmptyState={renderFollowingEmptyState}
        renderEndOfFeed={FollowingEndOfFeed}
      />
      {customFeeds.map((f, index) => {
        return (
          <FeedPage
            key={f}
            testID="customFeedPage"
            isPageFocused={selectedPageIndex === 1 + index}
            feed={f}
            renderEmptyState={renderCustomFeedEmptyState}
          />
        )
      })}
    </Pager>
  ) : (
    <Pager
      testID="homeScreen"
      onPageSelected={onPageSelected}
      onPageScrollStateChanged={onPageScrollStateChanged}
      renderTabBar={renderTabBar}
      tabBarPosition="top">
      <HomeLoggedOutCTA />
    </Pager>
  )
}

const styles = StyleSheet.create({
  loading: {
    height: '100%',
    alignContent: 'center',
    justifyContent: 'center',
    paddingBottom: 100,
  },
})
